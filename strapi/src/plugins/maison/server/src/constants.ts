export const PLUGIN_ID = 'maison';

export const UID = {
  collection: 'plugin::maison.collection',
  product: 'plugin::maison.product',
  boutique: 'plugin::maison.boutique',
  stockLevel: 'plugin::maison.stock-level',
  appointment: 'plugin::maison.appointment',
  notification: 'plugin::maison.notification',
} as const;

/** Full action UIDs, as stored on admin tokens and checked by tool auth policies. */
export const ACTION = {
  catalogRead: 'plugin::maison.catalog.read',
  appointmentsRequest: 'plugin::maison.appointments.request',
  appointmentsReview: 'plugin::maison.appointments.review',
  appointmentsConfirm: 'plugin::maison.appointments.confirm',
  confirmationsSend: 'plugin::maison.confirmations.send',
  demoManage: 'plugin::maison.demo.manage',
} as const;

export const TOOL_NAMES = [
  'browse_collections',
  'search_products',
  'view_product',
  'find_boutiques',
  'request_appointment',
  'my_appointments',
  'appointment_requests',
  'confirm_appointment',
  'pending_confirmations',
  'record_confirmation',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const CATEGORIES = ['trunk', 'bag', 'small-leather', 'travel', 'objet'] as const;
export const OCCASIONS = ['travel', 'anniversary', 'birthday', 'wedding', 'new-job'] as const;
export const PERSONALIZATION_KINDS = ['initials-hot-stamp', 'hand-painted-stripes', 'monogram-color'] as const;

/** Where a visit was requested: the AI concierge, the app's own screens, or a website through the REST routes. */
export const CREATED_VIA = ['concierge', 'app', 'web'] as const;
export type CreatedVia = (typeof CREATED_VIA)[number];

/** Provides resolveSubject(authorization) for customer identity (oauth-mcp-manager 1.1). */
export const OAUTH_PLUGIN_ID = 'strapi-oauth-mcp-manager';
/** Informational only: which surface made the call ("concierge" or absent). Never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
