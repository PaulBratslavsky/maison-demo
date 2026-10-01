/**
 * Keeps an appointment's customer (a full LINE user ID) out of every admin API response, and out of the
 * Content Manager's list search.
 *
 * Maison marks the field visible: false, which hides it in the Content Manager's views, and its tools and board
 * mask it. Strapi's admin sanitizer still returns non-visible fields to any admin API consumer, whatever a role's
 * field permissions say; it drops only fields marked hidden in the schema's config, as it does for admin users'
 * reset tokens. The list search (`_q`) matches text fields by substring unless they're marked searchable: false.
 * Defense in depth: nothing in the demo shows the field, and this keeps it that way for any admin client.
 * Maison's services read and write the field through the Document Service, which this doesn't change.
 *
 * Both flags belong in Maison's own schema. Delete this file once the plugin's repo has them.
 */
type MaisonPlugin = {
  contentTypes: Record<string, { schema: Record<string, any> }>;
};

export default (plugin: MaisonPlugin) => {
  const schema = plugin.contentTypes.appointment.schema;
  schema.attributes.customer = { ...schema.attributes.customer, searchable: false };
  schema.config = {
    ...schema.config,
    attributes: {
      ...schema.config?.attributes,
      customer: { ...schema.config?.attributes?.customer, hidden: true },
    },
  };
  return plugin;
};
