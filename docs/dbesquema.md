// ClawAndSoul - AI Pet Portrait E-Commerce Platform
// Database Schema v8.0
// Updated: May 23, 2026
//
// Cambios principales v8.0 (vs v7.0):
//   - `vision_configs` reestructurada: se eliminaron prompt_template, description_example y template_vars;
//     se añadieron system_prompt (Text) y max_tokens (Int) para alinearla con la API de visión.
//   - `styles` recupera prompt_template (Text, obligatorio), template_vars (json?) y añade
//     template_var_options (json?) — el template de prompt vive ahora en el estilo, no en la config de visión.
//   - La separación de responsabilidades queda: vision_configs define el modelo/temperatura/system-prompt;
//     styles define el prompt template y sus variables disponibles/opciones.
//
// Cambios principales v7.0 (vs v6.0):
//   - Se extrajo la configuración de pipeline de IA de `styles` a dos tablas nuevas:
//       · vision_configs    → modelo de visión, temperatura, prompt template, template_vars, description_example.
//       · image_gen_configs → proveedor (fal, etc.), modelo de imagen y parameters.
//   - `styles` ahora referencia ambas vía vision_config_id e image_gen_config_id (FK opcionales, onDelete: SetNull).
//   - Se eliminaron de `styles` las columnas: description, parameters, sort_order, fal_model,
//     prompt_template, vision_model, vision_temperature, description_example, template_vars.
//   - `style_images.caption` se renombró a `alt_image`.
//
// Cambios principales v6.0 (vs v5.0):
//   - Se eliminó la tabla product_types.
//   - product_references.product_type_id (FK) reemplazado por product_type varchar? (campo plano, sin FK).
//   - Se añadió índice en product_references(product_type).
//
// Cambios principales v5.0 (vs v4.0):
//   - Se añadió el módulo de Orders: Order, OrderItem, OrderEvent.
//   - product_references ahora incluye fulfillment_method (in_house | pod).
//   - order_items vincula Order ↔ ProductReference, ProductFormatVariant y Generation.
//   - order_events registra el historial de cambios de estado por ítem/orden.

// ============================================
// AUTHENTICATION & USERS
// ============================================

Table users {
id varchar [pk]
email varchar [not null, unique]
password_hash varchar [not null]
full_name varchar
role varchar [note: 'Enum: user, premium, admin']
email_verified boolean
is_active boolean
last_login_at timestamp
created_at timestamp
updated_at timestamp

indexes {
email [unique]
role
}
}

Table refresh_tokens {
id varchar [pk]
user_id varchar [not null, ref: > users.id]
token varchar [not null, unique]
expires_at timestamp [not null]
is_revoked boolean
created_at timestamp

indexes {
user_id
token [unique]
expires_at
}
}

// ============================================
// PETS & PET PHOTOS
// ============================================

Table pets {
id varchar [pk]
user_id varchar [not null, ref: > users.id]
name varchar [not null]
species varchar [not null, note: 'Enum: dog, cat, bird, rabbit, other']
breed varchar
age int
description text
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
user_id
species
(user_id, is_active)
}
}

Table pet_photos {
id varchar [pk]
pet_id varchar [not null, ref: > pets.id]
photo_url varchar [not null]
photo_storage_key varchar [not null]
is_primary boolean
order_index int
created_at timestamp

indexes {
pet_id
(pet_id, is_primary)
(pet_id, order_index)
}
}

// ============================================
// AI PIPELINE CONFIG
// ============================================

Table vision_configs {
id varchar [pk]
name varchar [not null, unique]
description text
vision_model varchar [note: 'Modelo de visión que analiza la foto de la mascota']
vision_temperature float
system_prompt text [note: 'Prompt de sistema enviado al modelo de visión']
max_tokens int [note: 'Límite de tokens en la respuesta del modelo de visión']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
}

Note: 'Configuración reutilizable para la etapa de visión: define modelo, temperatura, system prompt y max_tokens. El prompt template de generación vive ahora en styles.prompt_template. Referenciada por N styles (1 config → muchos estilos).'
}

Table image_gen_configs {
id varchar [pk]
name varchar [not null, unique]
description text
model varchar [note: 'ID del modelo del proveedor, e.g. fal-ai/flux/dev']
parameters json [note: 'Parámetros específicos del proveedor/modelo (steps, guidance_scale, etc.)']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
}

Note: 'Configuración reutilizable para la etapa de generación de imagen: define modelo y parámetros. Es referenciada por N styles.'
}

// ============================================
// STYLES & STYLE IMAGES
// ============================================

Table styles {
id varchar [pk]
name varchar [not null, unique]
display_name varchar [not null]
category varchar [not null, note: 'Familia artística: classic, modern, elegant, etc.']
thanks_url varchar
is_active boolean
created_at timestamp
updated_at timestamp

// Pipeline config
strategy_key varchar [not null, default: 'default']
prompt_template text [not null, note: 'Template del prompt de generación con placeholders sustituidos en tiempo de generación']
template_vars json [note: 'Variables disponibles para sustituir en prompt_template']
template_var_options json [note: 'Opciones/valores predefinidos para cada template_var']
vision_config_id varchar [ref: > vision_configs.id, note: 'FK opcional. onDelete: SetNull']
image_gen_config_id varchar [ref: > image_gen_configs.id, note: 'FK opcional. onDelete: SetNull']

indexes {
category
is_active
(category, is_active)
vision_config_id
image_gen_config_id
}

Note: 'Un Style representa una identidad artística reutilizable por múltiples ProductReferences (ej. "Acuarela" en Póster Acuarela y en Taza Acuarela). El prompt template de generación y sus variables viven aquí. vision_configs define el modelo/system-prompt de visión; image_gen_configs el modelo de imagen; strategy_key orquesta ambas etapas.'
}

Table style_images {
id varchar [pk]
style_id varchar [not null, ref: > styles.id]
image_url varchar [not null]
storage_key varchar [not null]
alt_image varchar
order_index int [not null]
is_primary boolean
created_at timestamp

indexes {
style_id
(style_id, order_index)
(style_id, is_primary)
}
}

// ============================================
// FORMATS & PRODUCT REFERENCES
// ============================================

Table formats {
id varchar [pk]
name varchar [not null, unique, note: 'slug: portrait_8x10, portrait_12x16, museum_20x25, etc.']
display_name varchar [not null]
aspect_ratio varchar [not null, note: '4:5, 3:4, 2:3, etc.']
width int [not null, note: 'Ancho en px para la generación IA']
height int [not null, note: 'Alto en px para la generación IA']
shopify_variant_option varchar [note: 'Valor exacto de la opción "Size" en Shopify, e.g. "8x10"']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
}

Note: 'Define tamaño/aspect-ratio. Compartido entre productos (M-a-M via product_format_variants).'
}

Table product_references {
id varchar [pk]
shopify_product_id varchar [not null, unique, note: 'ID numérico del producto en Shopify']
shopify_handle varchar [note: 'Handle de Shopify, e.g. poster-acuarela']
name varchar [not null, note: 'slug derivado del handle de Shopify']
display_name varchar [not null, note: 'e.g. Póster Acuarela']
description text
style_id varchar [ref: > styles.id, note: 'Estilo fijo de este producto. Null hasta que un admin lo asigna.']
product_type varchar [note: 'Campo plano derivado de Shopify product_type en el sync. Sin FK.']
fulfillment_method varchar [not null, default: 'in_house', note: 'Enum: in_house | pod']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
style_id
product_type
}

Note: 'Espejo ligero de un producto de Shopify. Cada producto lleva un estilo fijo (style_id), un tipo (product_type, campo plano) y un método de fulfillment (in_house | pod). El sync lo crea con style_id = null; un admin lo vincula manualmente. Sin estilo asignado el producto no aparece en el flujo de generación.'
}

Table product_format_variants {
id varchar [pk]
product_ref_id varchar [not null, ref: > product_references.id]
format_id varchar [not null, ref: > formats.id]
shopify_variant_id varchar [not null, note: 'ID numérico de la variante en Shopify']
shopify_variant_title varchar [not null, note: 'e.g. 8x10 / Matte']
constraints json [note: 'Overrides por (producto, formato): dpi, cropMode, maxPets, bleedMm, etc. Ver compat.md.']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
(product_ref_id, shopify_variant_id) [unique]
shopify_variant_id
}

Note: 'Los tamaños disponibles de un producto. Cada fila = un formato disponible = una variante de Shopify. Los constraints por combinación (producto, formato) viven aquí.'
}

// ============================================
// GENERATIONS
// ============================================

Table generations {
id varchar [pk]
user_id varchar [not null, ref: > users.id]
pet_id varchar [not null, ref: > pets.id]
pet_photo_id varchar [ref: > pet_photos.id]
style_id varchar [not null, ref: > styles.id, note: 'Denormalizado desde product_references.style_id al crear la generación']
format_id varchar [ref: > formats.id]
product_ref_id varchar [ref: > product_references.id]
type varchar [not null, note: 'Enum: image, video']
status varchar [note: 'Enum: pending, processing, completed, failed']
prompt text [not null]
negative_prompt text
result_url varchar
result_storage_key varchar
thumbnail_url varchar
provider varchar [not null]
processing_time_seconds int
error_message text
metadata json
vision_analysis json [note: 'Salida cruda del modelo de visión analizando la foto']
final_prompt text [note: 'Prompt resuelto tras sustitución de template y enriquecimiento de visión']
fal_request_id varchar [note: 'ID asíncrono de fal.ai para polling de estado']
prompt_snapshot json [note: 'Snapshot de config de estilo/prompt al momento de la generación']
is_public boolean
is_favorite boolean
created_at timestamp
completed_at timestamp
updated_at timestamp

indexes {
user_id
pet_id
pet_photo_id
status
type
(user_id, status)
(user_id, type)
created_at [note: 'sort: desc']
}

Note: 'style_id se denormaliza en el momento de crear la generación (copiado de product_references.style_id) para preservar el historial aunque el producto cambie de estilo después.'
}

// ============================================
// ORDERS
// ============================================

Table orders {
id varchar [pk]
shopify_order_id varchar [not null, unique, note: 'ID numérico del pedido en Shopify']
shopify_order_gid varchar [note: 'Global ID de Shopify (gid://shopify/Order/...)']
order_number varchar [not null, note: 'Número de pedido visible, e.g. #1001']
user_id varchar [ref: > users.id, note: 'Null si el cliente no tiene cuenta en la plataforma']
customer_email varchar
customer_name varchar
customer_phone varchar
financial_status varchar [note: 'paid | refunded | pending | voided']
fulfillment_status varchar [note: 'unfulfilled | partial | fulfilled']
currency varchar [default: 'USD']
subtotal_amount decimal [not null]
shipping_amount decimal
tax_amount decimal
total_amount decimal [not null]
shipping_address json
billing_address json
customer_note varchar
shopify_created_at timestamp [not null]
shopify_updated_at timestamp
cancelled_at timestamp
raw_payload json [not null, note: 'Payload completo del webhook de Shopify']
created_at timestamp
updated_at timestamp

indexes {
user_id
customer_email
shopify_created_at [note: 'sort: desc']
financial_status
}

Note: 'Espejo de un pedido de Shopify creado vía webhook. raw_payload guarda el JSON original para re-procesamiento. user_id se resuelve por email al sincronizar.'
}

Table order_items {
id varchar [pk]
order_id varchar [not null, ref: > orders.id]
shopify_line_item_id varchar [not null, note: 'ID de la línea en Shopify']
shopify_variant_id varchar [note: 'ID numérico de la variante comprada']
shopify_product_id varchar [note: 'ID numérico del producto en Shopify']
product_ref_id varchar [ref: > product_references.id]
product_format_variant_id varchar [ref: > product_format_variants.id]
generation_id varchar [ref: > generations.id, note: 'Arte generado que se imprimirá. Null hasta que el cliente lo vincula.']
title varchar [not null]
variant_title varchar
sku varchar
quantity int [not null]
unit_price decimal [not null]
total_price decimal [not null]
image_url varchar
style varchar [note: 'Nombre del estilo copiado de la variante']
size varchar [note: 'Tamaño copiado de la variante']
fulfillment_method varchar [not null, default: 'in_house', note: 'in_house | pod']
production_status varchar [not null, default: 'paid', note: 'paid | in_production | shipped | delivered | cancelled | refunded']
tracking_number varchar
tracking_url varchar
tracking_carrier varchar
pod_provider varchar [note: 'Proveedor POD, e.g. printful, printify']
pod_order_id varchar [note: 'ID del pedido en el proveedor POD']
pod_raw_response json [note: 'Respuesta cruda del proveedor POD']
notes varchar
shipped_at timestamp
delivered_at timestamp
created_at timestamp
updated_at timestamp

indexes {
(order_id, shopify_line_item_id) [unique]
generation_id
production_status
fulfillment_method
product_ref_id
}

Note: 'Cada línea de un pedido de Shopify. Se vincula a una Generation cuando el cliente asocia su arte. production_status sigue el ciclo de vida de producción independientemente del fulfillment_status de Shopify.'
}

Table order_events {
id varchar [pk]
order_id varchar [not null, ref: > orders.id]
order_item_id varchar [ref: > order_items.id]
event_type varchar [not null, note: 'status_change | tracking_added | webhook_received | manual_resync | pod_submit | pod_skip | warning']
from_status varchar
to_status varchar
payload json
user_id varchar [note: 'Admin que disparó el evento; null si fue automático']
source varchar [not null, default: 'system', note: 'system | admin | webhook | pod']
created_at timestamp

indexes {
(order_id, created_at) [note: 'sort: desc']
order_item_id
}

Note: 'Log inmutable de cambios de estado en órdenes e ítems. Permite auditar toda la vida del pedido (webhook recibido, arte vinculado, enviado a POD, tracking añadido, etc.).'
}

// ============================================
// AUDIT LOGS
// ============================================

Table audit_logs {
id varchar [pk]
user_id varchar [ref: > users.id]
action varchar [not null]
entity_type varchar
entity_id varchar
ip_address varchar
user_agent varchar
details json
created_at timestamp

indexes {
user_id
action
(created_at) [note: 'sort: desc']
}
}

// ============================================
// SYNC LOGS
// ============================================

Table sync_logs {
id varchar [pk]
type varchar [not null, note: 'cron | manual | webhook']
status varchar [not null, note: 'running | completed | failed']
started_at timestamp [not null]
completed_at timestamp
products_checked int
products_created int
products_updated int
products_deactivated int
errors json
metadata json
created_at timestamp

indexes {
type
status
(started_at) [name: 'idx_sync_logs_started_at']
}
}

// ============================================
// RELACIONES CLAVE (resumen)
// ============================================
//
// VisionConfig     --<  Style                 (1 config de visión, N estilos que la usan)
// ImageGenConfig   --<  Style                 (1 config de generación, N estilos que la usan)
// Style            --<  ProductReference      (1 estilo, N productos que lo usan)
// ProductReference --<  ProductFormatVariant  (1 producto, N tamaños disponibles)
// Format           --<  ProductFormatVariant  (1 formato, N productos que lo ofrecen)
//
// Al crear una Generation:
//   1. El cliente envía: productRefId + formatId
//   2. El backend deriva: styleId = product_references.style_id
//   3. Valida que product_format_variants tenga la fila (productRefId, formatId) activa
//   4. Guarda styleId denormalizado en generations para historial inmutable
//
// Flujo de Orders (Shopify → plataforma):
//   1. Webhook de Shopify crea/actualiza Order + OrderItems
//   2. Cada OrderItem se vincula a ProductReference y ProductFormatVariant por shopify_variant_id
//   3. user_id se resuelve por customer_email (null si no existe cuenta)
//   4. El cliente vincula su Generation al OrderItem (generation_id)
//   5. Admin cambia production_status; cada cambio genera un OrderEvent
//   6. Si fulfillment_method = 'pod', se envía a proveedor y se guarda pod_order_id/pod_raw_response
