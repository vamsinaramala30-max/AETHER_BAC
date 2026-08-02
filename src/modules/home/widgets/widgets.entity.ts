export interface WidgetConfigEntity {
  id: string;
  widgetKey: string;
  title: string;
  enabled: boolean;
  order: number;
}

export interface WidgetsEntity {
  widgets: WidgetConfigEntity[];
}
