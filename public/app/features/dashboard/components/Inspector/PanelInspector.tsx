import React, { PureComponent } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';

import { DashboardModel, PanelModel } from 'app/features/dashboard/state';
import { JSONFormatter, Drawer, Select, Table, TabsBar, Tab, TabContent } from '@grafana/ui';
import { getLocationSrv, getDataSourceSrv } from '@grafana/runtime';
import { DataFrame, DataSourceApi, SelectableValue, applyFieldOverrides } from '@grafana/data';
import { config } from 'app/core/config';

interface Props {
  dashboard: DashboardModel;
  panel: PanelModel;
}

enum InspectTab {
  Data = 'data',
  Raw = 'raw',
  Issue = 'issue',
  Meta = 'meta', // When result metadata exists
}

interface State {
  // The last raw response
  last?: any;

  // Data frem the last response
  data: DataFrame[];

  // The selected data frame
  selected: number;

  // The Selected Tab
  tab: InspectTab;

  // If the datasource supports custom metadata
  metaDS?: DataSourceApi;
}

export class PanelInspector extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      data: [],
      selected: 0,
      tab: InspectTab.Data,
    };
  }

  async componentDidMount() {
    const { panel } = this.props;
    if (!panel) {
      this.onDismiss(); // Try to close the component
      return;
    }

    // TODO? should we get the result with an observable once?
    const lastResult = (panel.getQueryRunner() as any).lastResult;
    if (!lastResult) {
      this.onDismiss(); // Usually opened from refresh?
      return;
    }

    // Find the first DataSource wanting to show custom metadata
    let metaDS: DataSourceApi;
    const data = lastResult?.series as DataFrame[];
    if (data) {
      for (const frame of data) {
        const key = frame.meta?.datasource;
        if (key) {
          const ds = await getDataSourceSrv().get(key);
          if (ds && ds.components.MetadataInspector) {
            metaDS = ds;
            break;
          }
        }
      }
    }

    // Set last result, but no metadata inspector
    this.setState({
      last: lastResult,
      data,
      metaDS,
    });
  }

  onDismiss = () => {
    getLocationSrv().update({
      query: { inspect: null },
      partial: true,
    });
  };

  onSelectTab = (item: SelectableValue<InspectTab>) => {
    this.setState({ tab: item.value || InspectTab.Data });
  };

  onSelectedFrameChanged = (item: SelectableValue<number>) => {
    this.setState({ selected: item.value || 0 });
  };

  renderMetadataInspector() {
    const { metaDS, data } = this.state;
    if (!metaDS || !metaDS.components?.MetadataInspector) {
      return <div>No Metadata Inspector</div>;
    }
    return <metaDS.components.MetadataInspector datasource={metaDS} data={data} />;
  }

  renderDataTab(width: number) {
    const { data, selected } = this.state;
    if (!data || !data.length) {
      return <div>No Data</div>;
    }
    const choices = data.map((frame, index) => {
      return {
        value: index,
        label: `${frame.name} (${index})`,
      };
    });

    // Apply dummy styles
    const processed = applyFieldOverrides({
      data,
      theme: config.theme,
      fieldOptions: { defaults: {}, overrides: [] },
      replaceVariables: (value: string) => {
        return value;
      },
    });

    return (
      <div>
        {choices.length > 1 && (
          <div>
            <Select
              options={choices}
              value={choices.find(t => t.value === selected)}
              onChange={this.onSelectedFrameChanged}
            />
          </div>
        )}

        <Table width={width} height={400} data={processed[selected]} />
      </div>
    );
  }

  renderIssueTab() {
    return <div>TODO: show issue form</div>;
  }

  render() {
    const { panel } = this.props;
    const { last, tab } = this.state;
    if (!panel) {
      this.onDismiss(); // Try to close the component
      return null;
    }

    const tabs = [
      { label: 'Data', value: InspectTab.Data },
      { label: 'Issue', value: InspectTab.Issue },
      { label: 'Raw JSON', value: InspectTab.Raw },
    ];
    if (this.state.metaDS) {
      tabs.push({ label: 'Meta Data', value: InspectTab.Meta });
    }

    return (
      <Drawer title={panel.title} onClose={this.onDismiss}>
        <TabsBar>
          {tabs.map(t => {
            return <Tab label={t.label} active={t.value === tab} onChangeTab={() => this.onSelectTab(t)} />;
          })}
        </TabsBar>
        <TabContent>
          <AutoSizer disableHeight>
            {({ width }) => {
              if (width === 0) {
                return null;
              }
              return (
                <div style={{ width }}>
                  {tab === InspectTab.Data && this.renderDataTab(width)}

                  {tab === InspectTab.Meta && this.renderMetadataInspector()}

                  {tab === InspectTab.Issue && this.renderIssueTab()}

                  {tab === InspectTab.Raw && (
                    <div>
                      <JSONFormatter json={last} open={2} />
                    </div>
                  )}
                </div>
              );
            }}
          </AutoSizer>
        </TabContent>
      </Drawer>
    );
  }
}
