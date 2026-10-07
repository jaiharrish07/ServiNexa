import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

/**
 * Self-contained OpenAPI 3.0 document for the DQBH API.
 * Served at GET /api/docs (interactive) and GET /api/docs.json (raw).
 * Dev B endpoints are live; Dev A endpoints are documented and tagged "Dev A (after merge)".
 */

const bearer = [{ bearerAuth: [] as string[] }];
const jsonList = (itemsRef: string, dataKey: string) => ({
  type: 'object',
  properties: {
    [dataKey]: { type: 'array', items: { $ref: `#/components/schemas/${itemsRef}` } },
    meta: { $ref: '#/components/schemas/PageMeta' },
  },
});
const jsonOne = (ref: string, key: string) => ({
  type: 'object',
  properties: { [key]: { $ref: `#/components/schemas/${ref}` } },
});
const resp = (desc: string, schema?: object) => ({
  description: desc,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const listParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
  { name: 'sort', in: 'query', schema: { type: 'string' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
  { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search' },
];
const idPath = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DQBH API',
    version: '0.1.0',
    description:
      'Industrial Equipment Activity Management platform. Dev B slice: auth, CRUD, notifications, reports. ' +
      'Dev A endpoints (workflow transitions, AI, audit chain) appear after merge.',
  },
  servers: [{ url: '/', description: 'current host' }],
  tags: [
    { name: 'Auth' },
    { name: 'Sites' },
    { name: 'Machines' },
    { name: 'Technicians' },
    { name: 'Service Requests' },
    { name: 'Work Orders' },
    { name: 'Spare Parts' },
    { name: 'Notifications' },
    { name: 'Reports' },
    { name: 'Health' },
    { name: 'Dev A (after merge)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          details: { type: 'object' },
        },
      },
      PageMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          total_pages: { type: 'integer' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          full_name: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER'] },
        },
      },
      Site: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          code: { type: 'string' },
          city: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      Machine: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          site_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          code: { type: 'string' },
          type: { type: 'string' },
          status: { type: 'string', enum: ['OPERATIONAL', 'DEGRADED', 'DOWN', 'MAINTENANCE'] },
          criticality: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
        },
      },
      Technician: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          site_id: { type: 'string', format: 'uuid' },
          employee_code: { type: 'string' },
          specializations: { type: 'array', items: { type: 'string' } },
          is_available: { type: 'boolean' },
        },
      },
      ServiceRequest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          request_number: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          category: { type: 'string' },
        },
      },
      WorkOrder: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          order_number: { type: 'string' },
          service_request_id: { type: 'string', format: 'uuid' },
          technician_id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
        },
      },
      SparePart: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          site_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          part_number: { type: 'string' },
          quantity_available: { type: 'integer' },
          quantity_reserved: { type: 'integer' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          message: { type: 'string' },
          type: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL', 'SUCCESS'] },
          is_read: { type: 'boolean' },
        },
      },
    },
  },
  security: bearer,
  paths: {
    '/health': {
      get: { tags: ['Health'], security: [], summary: 'Liveness', responses: { 200: resp('ok') } },
    },
    '/health/ready': {
      get: { tags: ['Health'], security: [], summary: 'Readiness (DB ping)', responses: { 200: resp('ready'), 503: resp('degraded') } },
    },
    '/api/auth/signup': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Register a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'full_name'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  full_name: { type: 'string' },
                  role: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: resp('Created', jsonOne('User', 'user')), 400: resp('Bad request', { $ref: '#/components/schemas/Error' }) },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Login, returns JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
        responses: { 200: resp('Token + profile'), 401: resp('Invalid credentials', { $ref: '#/components/schemas/Error' }) },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user profile', responses: { 200: resp('Profile', jsonOne('User', 'user')), 401: resp('Unauthorized') } },
    },
    '/api/sites': {
      get: { tags: ['Sites'], summary: 'List sites', parameters: listParams, responses: { 200: resp('Sites', jsonList('Site', 'sites')) } },
      post: { tags: ['Sites'], summary: 'Create site (ADMIN)', responses: { 201: resp('Created', jsonOne('Site', 'site')) } },
    },
    '/api/sites/{id}': {
      get: { tags: ['Sites'], summary: 'Site detail', parameters: [idPath], responses: { 200: resp('Site', jsonOne('Site', 'site')), 404: resp('Not found') } },
      patch: { tags: ['Sites'], summary: 'Update site (ADMIN)', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('Site', 'site')) } },
    },
    '/api/machines': {
      get: { tags: ['Machines'], summary: 'List/filter machines', parameters: [...listParams, { name: 'site_id', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('Machines', jsonList('Machine', 'machines')) } },
      post: { tags: ['Machines'], summary: 'Create machine (ADMIN/OPS)', responses: { 201: resp('Created', jsonOne('Machine', 'machine')) } },
    },
    '/api/machines/{id}': {
      get: { tags: ['Machines'], summary: 'Machine detail', parameters: [idPath], responses: { 200: resp('Machine', jsonOne('Machine', 'machine')), 404: resp('Not found') } },
      patch: { tags: ['Machines'], summary: 'Update machine (ADMIN/OPS)', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('Machine', 'machine')) } },
    },
    '/api/technicians': {
      get: { tags: ['Technicians'], summary: 'List/filter technicians', parameters: [...listParams, { name: 'site_id', in: 'query', schema: { type: 'string' } }, { name: 'available', in: 'query', schema: { type: 'boolean' } }], responses: { 200: resp('Technicians', jsonList('Technician', 'technicians')) } },
      post: { tags: ['Technicians'], summary: 'Create technician (ADMIN)', responses: { 201: resp('Created', jsonOne('Technician', 'technician')) } },
    },
    '/api/technicians/{id}': {
      get: { tags: ['Technicians'], summary: 'Technician detail', parameters: [idPath], responses: { 200: resp('Technician', jsonOne('Technician', 'technician')), 404: resp('Not found') } },
      patch: { tags: ['Technicians'], summary: 'Update technician (ADMIN/OPS)', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('Technician', 'technician')) } },
    },
    '/api/service-requests': {
      get: { tags: ['Service Requests'], summary: 'List/filter SRs', parameters: [...listParams, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'site_id', in: 'query', schema: { type: 'string' } }, { name: 'priority', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('SRs', jsonList('ServiceRequest', 'service_requests')) } },
      post: { tags: ['Service Requests'], summary: 'Create SR', responses: { 201: resp('Created', jsonOne('ServiceRequest', 'service_request')) } },
    },
    '/api/service-requests/{id}': {
      get: { tags: ['Service Requests'], summary: 'SR detail (with relations)', parameters: [idPath], responses: { 200: resp('SR', jsonOne('ServiceRequest', 'service_request')), 404: resp('Not found') } },
      patch: { tags: ['Service Requests'], summary: 'Update SR', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('ServiceRequest', 'service_request')) } },
    },
    '/api/work-orders': {
      get: { tags: ['Work Orders'], summary: 'List work orders', parameters: [...listParams, { name: 'service_request_id', in: 'query', schema: { type: 'string' } }, { name: 'technician_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('Work orders', jsonList('WorkOrder', 'work_orders')) } },
      post: { tags: ['Work Orders'], summary: 'Create work order (ADMIN/OPS)', responses: { 201: resp('Created', jsonOne('WorkOrder', 'work_order')) } },
    },
    '/api/work-orders/{id}': {
      patch: { tags: ['Work Orders'], summary: 'Update work order', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('WorkOrder', 'work_order')) } },
    },
    '/api/spare-parts': {
      get: { tags: ['Spare Parts'], summary: 'List parts', parameters: [...listParams, { name: 'site_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('Parts', jsonList('SparePart', 'spare_parts')) } },
      post: { tags: ['Spare Parts'], summary: 'Create part (ADMIN/OPS)', responses: { 201: resp('Created', jsonOne('SparePart', 'spare_part')) } },
    },
    '/api/spare-parts/{id}': {
      patch: { tags: ['Spare Parts'], summary: 'Update part (ADMIN/OPS)', parameters: [idPath], responses: { 200: resp('Updated', jsonOne('SparePart', 'spare_part')) } },
    },
    '/api/spare-parts/{id}/reserve': {
      post: { tags: ['Spare Parts'], summary: 'Reserve stock (atomic)', parameters: [idPath], responses: { 201: resp('Reserved'), 400: resp('Insufficient stock', { $ref: '#/components/schemas/Error' }), 409: resp('Concurrent conflict') } },
    },
    '/api/notifications': {
      get: { tags: ['Notifications'], summary: "Current user's notifications", parameters: listParams, responses: { 200: resp('Notifications', jsonList('Notification', 'notifications')) } },
    },
    '/api/notifications/unread-count': {
      get: { tags: ['Notifications'], summary: 'Unread count', responses: { 200: resp('Count') } },
    },
    '/api/notifications/{id}/read': {
      patch: { tags: ['Notifications'], summary: 'Mark read', parameters: [idPath], responses: { 200: resp('Marked') } },
    },
    '/api/notifications/read-all': {
      patch: { tags: ['Notifications'], summary: 'Mark all read', responses: { 200: resp('Done') } },
    },
    '/api/reports/dashboard': {
      get: { tags: ['Reports'], summary: 'Dashboard stats', parameters: [{ name: 'site_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('Dashboard') } },
    },
    '/api/reports/sla': {
      get: { tags: ['Reports'], summary: 'SLA compliance (ADMIN/OPS)', parameters: [{ name: 'site_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('SLA report') } },
    },
    '/api/reports/mttr': {
      get: { tags: ['Reports'], summary: 'Mean time to resolve (ADMIN/OPS)', parameters: [{ name: 'site_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('MTTR report') } },
    },
    '/api/reports/utilization': {
      get: { tags: ['Reports'], summary: 'Technician utilization (ADMIN/OPS)', parameters: [{ name: 'site_id', in: 'query', schema: { type: 'string' } }], responses: { 200: resp('Utilization report') } },
    },
    '/api/reports/parts-rebalance': {
      get: { tags: ['Reports'], summary: 'Cross-site parts suggestions (ADMIN/OPS)', responses: { 200: resp('Suggestions') } },
    },
    '/api/service-requests/{id}/transition': {
      post: { tags: ['Dev A (after merge)'], summary: 'Workflow transition', parameters: [idPath], responses: { 200: resp('Transitioned') } },
    },
    '/api/ai/classify': {
      post: { tags: ['Dev A (after merge)'], summary: 'AI classify request', responses: { 200: resp('Classification') } },
    },
    '/api/audit/verify': {
      get: { tags: ['Dev A (after merge)'], summary: 'Verify tamper-evident chain', responses: { 200: resp('Verification') } },
    },
  },
} as const;

export function mountDocs(app: Express) {
  app.get('/api/docs.json', (_req: Request, res: Response) => res.json(openApiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument as unknown as swaggerUi.JsonObject, {
    customSiteTitle: 'DQBH API Docs',
  }));
}
