import type { PlanName } from '@prisma/client';

export type PlanDefinition = {
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
  entitlements: Array<{ feature: string; limit?: number | null; enabled?: boolean }>;
};

export const planCatalog: Record<PlanName, PlanDefinition> = {
  FREE: {
    limits: {
      objectives: 3,
      indicators: 10,
      segmentsPerIndicator: 2,
      checkinsPerMonth: 20,
      alertsPerDay: 5,
      ingestionIntervalMinutes: 360,
      mcpTools: 2
    },
    features: {
      'agent.enabled': false,
      'agent.backfill': false,
      'connectors.read_only': true,
      'connectors.scheduled': false,
      'alerts.email': true,
      'alerts.slack': false,
      'exports.enabled': false,
      'mcp.enabled': true,
      'mcp.toolset': 'core',
      'support.sla_hours': 72
    },
    entitlements: [
      { feature: 'OBJECTIVES', limit: 3, enabled: true },
      { feature: 'KRESULTS', limit: 10, enabled: true },
      { feature: 'KPIS', limit: 5, enabled: true },
      { feature: 'CHECKINS', enabled: true },
      { feature: 'ALERTS', enabled: true },
      { feature: 'BILLING_UPGRADE', enabled: true },
      { feature: 'BILLING_PORTAL', enabled: true },
      { feature: 'INTEGRATIONS', enabled: true },
      { feature: 'AGENTS', enabled: false },
      { feature: 'DASHBOARDS_ENTERPRISE', enabled: false }
    ]
  },
  PRO: {
    limits: {
      objectives: 'unlimited',
      indicators: 'unlimited',
      segmentsPerIndicator: 5,
      checkinsPerMonth: 'unlimited',
      alertsPerDay: 50,
      ingestionIntervalMinutes: 60,
      mcpTools: 6
    },
    features: {
      'agent.enabled': false,
      'agent.backfill': true,
      'connectors.read_only': true,
      'connectors.scheduled': true,
      'alerts.email': true,
      'alerts.slack': true,
      'exports.enabled': true,
      'exports.formats': ['csv'],
      'mcp.enabled': true,
      'mcp.toolset': 'advanced',
      'support.sla_hours': 24
    },
    entitlements: [
      { feature: 'OBJECTIVES', limit: null, enabled: true },
      { feature: 'KRESULTS', limit: null, enabled: true },
      { feature: 'KPIS', limit: null, enabled: true },
      { feature: 'CHECKINS', enabled: true },
      { feature: 'ALERTS', enabled: true },
      { feature: 'BILLING_UPGRADE', enabled: true },
      { feature: 'BILLING_PORTAL', enabled: true },
      { feature: 'INTEGRATIONS', enabled: true },
      { feature: 'AGENTS', enabled: false },
      { feature: 'DASHBOARDS_ENTERPRISE', enabled: false }
    ]
  },
  ENTERPRISE: {
    limits: {
      objectives: 'unlimited',
      indicators: 'unlimited',
      segmentsPerIndicator: 10,
      checkinsPerMonth: 'unlimited',
      alertsPerDay: 200,
      ingestionIntervalMinutes: 15,
      mcpTools: 'unlimited',
      indicatorHistoryRetentionDays: null
    },
    features: {
      'agent.enabled': true,
      'agent.backfill': true,
      'agent.private_network': true,
      'connectors.read_only': true,
      'connectors.scheduled': true,
      'connectors.agent': true,
      'alerts.email': true,
      'alerts.slack': true,
      'alerts.webhooks': true,
      'exports.enabled': true,
      'exports.formats': ['csv', 'parquet'],
      'mcp.enabled': true,
      'mcp.toolset': 'full',
      'mcp.telemetry': true,
      'support.sla_hours': 4,
      'sso.enabled': true,
      'audit.trail': true
    },
    entitlements: [
      { feature: 'OBJECTIVES', limit: null, enabled: true },
      { feature: 'KRESULTS', limit: null, enabled: true },
      { feature: 'KPIS', limit: null, enabled: true },
      { feature: 'CHECKINS', enabled: true },
      { feature: 'ALERTS', enabled: true },
      { feature: 'BILLING_UPGRADE', enabled: true },
      { feature: 'BILLING_PORTAL', enabled: true },
      { feature: 'INTEGRATIONS', enabled: true },
      { feature: 'AGENTS', enabled: true },
      { feature: 'DASHBOARDS_ENTERPRISE', enabled: true }
    ]
  }
};
