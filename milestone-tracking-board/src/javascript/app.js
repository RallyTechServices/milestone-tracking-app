(function () {
    var Ext = window.Ext4 || window.Ext;

    /**
     * Iteration Tracking Board App
     * The Iteration Tracking Board can be used to visualize and manage your User Stories and Defects within an Iteration.
     */
    Ext.define('technical-services-MilestoneTrackingApp', {
        extend: 'Rally.app.App',
        componentCls: 'iterationtrackingboard',
        logger: new Rally.technicalservices.Logger(),
        settingsScope: 'project',
        autoScroll: false,

        config: {
            defaultSettings: {
                ignoreProjectScoping: true
            }
        },
        items: [
            {xtype:'container',itemId:'selection_box', layout: {type: 'hbox'}, padding: 10},
            {xtype:'container',itemId:'banner_box'},
            {xtype:'container',itemId:'grid_box'}
        ],

        integrationHeaders : {
                name : "ts-MilestoneTrackingApp"
        },

        sModelNames: [],

        launch: function(){

            if(!this.rendered) {
                this.on('afterrender', this.launch, this, {single: true});
                return;
            }

            Rally.technicalservices.Utilities.fetchPortfolioTypes().then({
                scope: this,
                success: function(records){
                    this.sModelNames = Ext.Array.from(_.first(records).get('TypePath'));
                    //this.firstPortfolioItemName = _.first(records).get('Name');
                    this._addComponents();
                },
                failure: function(msg){
                    Rally.ui.notify.Notifier.showError({message: msg});
                }
            });
        },
        _addComponents: function(){
            var cb = this.down('#selection_box').add({
                xtype: 'rallymilestonecombobox'
            });
            cb.on('change', this._update, this);

            var tpl = new Ext.XTemplate('<div class="selector-msg"><tpl if="days &gt;= 0">{days} days remaining until target date',
                '<tpl elseif="days &lt; 0">{days*(-1)} days past target date',
                '<tpl else>No target date set for milestone</tpl></div>');

            this.down('#selection_box').add({
                xtype: 'container',
                itemId: 'remaining-days',
                flex: 1,
                tpl: tpl
            });


            var lt_tpl = new Ext.XTemplate('<tpl if="latestories &gt; 0"><div class="picto icon-warning warning" style="color:#FAD200;font-size:16px;"></div>',
                '<div class="latestories">{latestories} Late Stories</div></tpl>')

           // var lt_tpl = new Ext.XTemplate('<tpl if="latestories &gt; 0">{latestories} Late Stories<tpl else></tpl>')
            this.down('#selection_box').add({
                xtype: 'container',
                itemId: 'late-stories',
                flex: 1,
                style: {
                    textAlign: 'right'
                },
                tpl: lt_tpl
            });
        },
        _update: function(){

            this.down('#banner_box').removeAll();
            this.down('#grid_box').removeAll();

            var rec = this._getTimeBoxRecord();
            if (rec){
                var days = Rally.util.DateTime.getDifference(Rally.util.DateTime.fromIsoString(rec.get('TargetDate')),new Date(), 'day');
                this.down('#remaining-days').update({days: days});
            }

            this._addStatsBanner();
            this._getGridStore().then({
                success: this._addGridBoard,
                scope: this
            });

        },
        _getModelNames: function () {
            return this.sModelNames.concat(['HierarchicalRequirement','Defect']);
        },

        getSettingsFields: function () {
            var fields = this.callParent(arguments);
            fields.push({
                name: 'ignoreProjectScoping',
                xtype: 'rallycheckboxfield',
                label: 'Show Children in any Project'
            });

            fields.push({
                name: 'showTestCaseMetrics',
                xtype: 'rallycheckboxfield',
                label: 'Show Test Case Metrics'
            });

            fields.push({
                name: 'showDefectMetrics',
                xtype: 'rallycheckboxfield',
                label: 'Show Defect Metrics'
            });

            return fields;
        },
        _getFilters: function(){
            var filters = [];
            if (this._getTimeBoxRecord()){
                filters = Rally.data.wsapi.Filter({
                    property: "Milestones",
                    value: this._getMilestoneRef()
                });
            }
            return filters;
        },
        _getMilestoneRef: function(){
            var rec = this._getTimeBoxRecord();
            if (rec){
                return rec.get('_ref');
            }
            return null;
        },
        _getTimeBoxRecord: function(){
            if (this.down('rallymilestonecombobox') && this.down('rallymilestonecombobox').getRecord()){
                return this.down('rallymilestonecombobox').getRecord();
            }
            return null;
        },
        _getGridStore: function() {
            var context = this.getContext(),
                config = {
                    models: this._getModelNames(),
                    autoLoad: false,
                    remoteSort: true,
                    root: {expanded: true},
                    enableHierarchy: true,
                    expandingNodesRespectProjectScoping: !this.getSetting('ignoreProjectScoping')
                };

            config.filters = this._getFilters();
            console.log('config',config);
            return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(config).then({
                success: function (store) {
                    return store;
                }
            });
        },
        _updateLateStories: function(latestories){
            this.logger.log('_updateLateStories', latestories);
            this.down('#late-stories').update({latestories: latestories});
        },
        _addStatsBanner: function() {

            this.remove('statsBanner');
            this.down('#banner_box').add({
                xtype: 'statsbanner',
                itemId: 'statsBanner',
                //storeConfig: this._getStoreConfigs(),
                context: this.getContext(),
                timeboxRecord: this._getTimeBoxRecord(),
                timeboxEndDateField: 'TargetDate',
                filters: this._getFilters(),
                margin: '0 0 5px 0',
                listeners: {
                    resize: this._resizeGridBoardToFillSpace,
                    scope: this,
                    latestoriesfound: this._updateLateStories
                }
            });
        },

        _addGridBoard: function (gridStore) {
            var context = this.getContext();

            // gridStore.setParentTypes(this.sModelNames);
           // gridStore.load();

            //this.remove('gridBoard');

            this.gridboard = this.down('#grid_box').add({
                itemId: 'gridBoard',
                xtype: 'rallygridboard',
                stateId: 'portfoliotracking-gridboard',
                context: context,
                plugins: this._getGridBoardPlugins(),
                modelNames: this._getModelNames(),
                gridConfig: this._getGridConfig(gridStore),
                storeConfig: {
                    filters: this._getFilters()
                },
                addNewPluginConfig: {
                    style: {
                        'float': 'left',
                        'margin-right': '5px'
                    }
                },
                listeners: {
                    load: this._onLoad,
                    afterrender : function() {
                        console.log("afterrender",this);
                        this.setWidth(this.getWidth()+1);
                        console.log("afterrender",this.getWidth());
                        // console.log(this.getGridOrBoard()); //.getView().refresh(true);
                    },
                    scope: this
                },
                height: Math.max(this.getAvailableGridBoardHeight()-50, 150)
            });
        },

        /**
         * @private
         */
        getAvailableGridBoardHeight: function() {
            var height = this.getHeight();
            if(this.down('#statsBanner').rendered) {
                height -= this.down('#statsBanner').getHeight();
            }
            return height;
        },

        _getGridBoardPlugins: function() {
            var plugins = ['rallygridboardaddnew'],
                context = this.getContext();

            var alwaysSelectedValues = ['FormattedID', 'Name', 'Owner'];
            if (context.getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled) {
                alwaysSelectedValues.push('DragAndDropRank');
            }

            plugins.push({
                ptype: 'rallygridboardfilterinfo',
                isGloballyScoped: Ext.isEmpty(this.getSetting('project')),
                stateId: 'iteration-tracking-owner-filter-' + this.getAppId()
            });

            plugins.push({
                ptype: 'rallygridboardfieldpicker',
                headerPosition: 'left',
                gridFieldBlackList: [
                    'ObjectID',
                    'Description',
                    'DisplayColor',
                    'Notes',
                    'Subscription',
                    'Workspace',
                    'Changesets',
                    'RevisionHistory',
                    'Children'
                ],
                boardFieldBlackList: [
                    'ObjectID',
                    'Description',
                    'DisplayColor',
                    'Notes',
                    'Rank',
                    'DragAndDropRank',
                    'Subscription',
                    'Workspace',
                    'Changesets',
                    'RevisionHistory',
                    'PortfolioItemType',
                    'StateChangedDate',
                    'Children'
                ],
                alwaysSelectedValues: alwaysSelectedValues,
                modelNames: this.modelNames,
                boardFieldDefaults: (this.getSetting('cardFields') && this.getSetting('cardFields').split(',')) ||
                ['Parent', 'Tasks', 'Defects', 'Discussion', 'PlanEstimate', 'Iteration']
            });

            plugins.push({
                ptype: 'rallygridboardcustomfiltercontrol',
                filterControlConfig: {
                    modelNames: this._getModelNames(),
                    stateful: true,
                    stateId: context.getScopedStateId('tracking-filters')
                },
                showOwnerFilter: true,
                ownerFilterControlConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('tracking-owner-filter')
                }
            });

            return plugins;
        },

        setHeight: Ext.Function.createBuffered(function() {
            this.superclass.setHeight.apply(this, arguments);
            this._resizeGridBoardToFillSpace();
        }, 100),

        _resizeGridBoardToFillSpace: function() {
            if(this.gridboard) {
                this.gridboard.setHeight(this.getAvailableGridBoardHeight());
            }
        },

        _getCustomViewConfig: function() {
            var customViewConfig = {
                ptype: 'rallygridboardcustomview',
                stateId: 'iteration-tracking-board-app',

                defaultGridViews: [{
                    model: ['UserStory', 'Defect', 'DefectSuite'],
                    name: 'Defect Status',
                    state: {
                        cmpState: {
                            expandAfterApply: true,
                            columns: [
                                'Name',
                                'State',
                                'Discussion',
                                'Priority',
                                'Severity',
                                'FoundIn',
                                'FixedIn',
                                'Owner'
                            ]
                        },
                        filterState: {
                            filter: {
                                defectstatusview: {
                                    isActiveFilter: false,
                                    itemId: 'defectstatusview',
                                    queryString: '((Defects.ObjectID != null) OR (Priority != null))'
                                }
                            }
                        }
                    }
                }, {
                    model: ['UserStory', 'Defect', 'TestSet', 'DefectSuite'],
                    name: 'Task Status',
                    state: {
                        cmpState: {
                            expandAfterApply: true,
                            columns: [
                                'Name',
                                'State',
                                'PlanEstimate',
                                'TaskEstimate',
                                'ToDo',
                                'Discussions',
                                'Owner'
                            ]
                        },
                        filterState: {
                            filter: {
                                taskstatusview: {
                                    isActiveFilter: false,
                                    itemId: 'taskstatusview',
                                    queryString: '(Tasks.ObjectID != null)'
                                }
                            }
                        }
                    }
                }, {
                    model: ['UserStory', 'Defect', 'TestSet'],
                    name: 'Test Status',
                    state: {
                        cmpState: {
                            expandAfterApply: true,
                            columns: [
                                'Name',
                                'State',
                                'Discussions',
                                'LastVerdict',
                                'LastBuild',
                                'LastRun',
                                'ActiveDefects',
                                'Priority',
                                'Owner'
                            ]
                        },
                        filterState: {
                            filter: {
                                teststatusview: {
                                    isActiveFilter: false,
                                    itemId: 'teststatusview',
                                    queryString: '(TestCases.ObjectID != null)'
                                }
                            }
                        }
                    }
                }]
            };

            customViewConfig.defaultBoardViews = _.cloneDeep(customViewConfig.defaultGridViews);
            _.each(customViewConfig.defaultBoardViews, function(view) {
                delete view.state.cmpState;
            });

            return customViewConfig;
        },

        _createOwnerFilterItem: function (context) {
            var isPillPickerEnabled = context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE'),
                projectRef = context.getProjectRef();

            if (isPillPickerEnabled) {
                return {
                    xtype: 'rallyownerpillfilter',
                    margin: '-15 0 5 0',
                    filterChildren: this.getContext().isFeatureEnabled('S58650_ALLOW_WSAPI_TRAVERSAL_FILTER_FOR_MULTIPLE_TYPES'),
                    project: projectRef,
                    showPills: false,
                    showClear: true
                };
            } else {
                return {
                    xtype: 'rallyownerfilter',
                    margin: '5 0 5 0',
                    filterChildren: this.getContext().isFeatureEnabled('S58650_ALLOW_WSAPI_TRAVERSAL_FILTER_FOR_MULTIPLE_TYPES'),
                    project: projectRef
                };
            }

        },

        _createTagFilterItem: function (context) {
            var filterUiImprovementsToggleEnabled = context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE');
            return {
                xtype: 'rallytagpillfilter',
                margin: filterUiImprovementsToggleEnabled ? '-15 0 5 0' : '5 0 5 0',
                showPills: filterUiImprovementsToggleEnabled,
                showClear: filterUiImprovementsToggleEnabled,
                remoteFilter: filterUiImprovementsToggleEnabled
            };
        },

        _createModelFilterItem: function (context) {
            return {
                xtype: 'rallymodelfilter',
                models: this.modelNames,
                context: context
            };
        },

        _getGridConfig: function (gridStore) {
            var context = this.getContext(),
                stateString = 'release-tracking',
                stateId = context.getScopedStateId(stateString);

            var gridConfig = {
                xtype: 'rallytreegrid',
                store: gridStore,
                //enableRanking: this.getContext().getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled,
                //enableRanking: false,
                //enableBulkEdit: false,
                //enableEditing: false,
                columnCfgs: ['Name'], //must set this to null to offset default behaviors in the gridboard
                defaultColumnCfgs: this._getGridColumns(),
                model: 'UserStory',
                showSummary: true,
                summaryColumns: this._getSummaryColumnConfig(),
                plugins: [],
                stateId: stateId,
                stateful: true
            };

            return gridConfig;
        },

        _getSummaryColumnConfig: function () {
            var taskUnitName = this.getContext().getWorkspace().WorkspaceConfiguration.TaskUnitName,
                planEstimateUnitName = this.getContext().getWorkspace().WorkspaceConfiguration.IterationEstimateUnitName;

            return [
                {
                    field: 'AcceptedLeafStoryCount',
                    type: 'sum',
                    units: 'Total'
                },
                {
                    field: 'AcceptedLeafStoryPlanEstimateTotal',
                    type: 'sum',
                    units: planEstimateUnitName
                },
                {
                    field: 'LeafStoryCount',
                    type: 'sum',
                    units: 'Total'
                },
                {
                    field: 'LeafStoryPlanEstimateTotal',
                    type: 'sum',
                    units: planEstimateUnitName
                },
                {
                    field: 'UnEstimatedLeafStoryCount',
                    type: 'sum',
                    units: 'Total'
                }
            ];
        },

        _getGridColumns: function (columns) {
            var result = ['FormattedID', 'Name', 'PercentDoneByStoryPlanEstimate', 'PreliminaryEstimate', 'ScheduleState', 'PlanEstimate', 'Blocked', 'Iteration', 'Owner', 'Discussion'];

            if (columns) {
                result = columns;
            }
            _.pull(result, 'FormattedID');

            return result;
        },

        _onLoad: function () {
            //this._publishContentUpdated();
            this.recordComponentReady();
        },

        _onBoardFilter: function () {
            this.setLoading(true);
        },

        _onBoardFilterComplete: function () {
            this.setLoading(false);
        },

        getOptions: function() {
            return [
                {
                    text: 'About...',
                    handler: this._launchInfo,
                    scope: this
                }
            ];
        },

        _launchInfo: function() {
            if ( this.about_dialog ) { this.about_dialog.destroy(); }
            this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{
                informationHtml:  "<br/>"
            });
        },

        isExternal: function(){
            return typeof(this.getAppId()) == 'undefined';
        }
    });
})();