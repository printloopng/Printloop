import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

const renderMetricsRegistry = new Registry();

collectDefaultMetrics({ register: renderMetricsRegistry, prefix: 'render_worker_' });

export const renderJobsTotal = new Counter({
  name: 'printloop_render_jobs_total',
  help: 'Total render jobs processed',
  labelNames: ['status'],
  registers: [renderMetricsRegistry],
});

export const renderDuration = new Histogram({
  name: 'printloop_render_duration_seconds',
  help: 'Render duration in seconds',
  buckets: [5, 10, 30, 60, 120, 300, 600],
  labelNames: ['status'],
  registers: [renderMetricsRegistry],
});

export const renderRetriesTotal = new Counter({
  name: 'printloop_render_retries_total',
  help: 'Total render job retries',
  labelNames: ['attempt'],
  registers: [renderMetricsRegistry],
});

export const stuckRendersGauge = new Gauge({
  name: 'printloop_stuck_renders',
  help: 'Number of renders stuck > 15min',
  registers: [renderMetricsRegistry],
});

export const renderQueueDepth = new Gauge({
  name: 'printloop_render_queue_depth',
  help: 'Current number of jobs in render queue',
  labelNames: ['status'],
  registers: [renderMetricsRegistry],
});

export const renderWorkerInfo = new Gauge({
  name: 'printloop_render_worker_info',
  help: 'Render worker info',
  labelNames: ['version', 'node_version'],
  registers: [renderMetricsRegistry],
});

renderWorkerInfo.set(
  { version: process.env.APP_VERSION || 'unknown', node_version: process.version },
  1
);

export { renderMetricsRegistry };