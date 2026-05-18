// ClawAndSoul - AI Pet Portrait E-Commerce Platform
// Database Schema v4.0
// Updated: May 18, 2026
//
// Cambio principal v4.0:
//   - Cada producto de Shopify lleva un estilo fijo (muchos-a-uno con styles).
//   - Se eliminó la tabla style_format_product_compat (matriz de 3 ejes).
//   - Se añadió product_types para categorizar los productos físicos.
//   - product_references ahora referencia style_id y product_type_id.
//   - product_format_variants absorbe los constraints por (producto, formato).

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
// STYLES & STYLE IMAGES
// ============================================

Table styles {
id varchar [pk]
name varchar [not null, unique]
display_name varchar [not null]
description text
category varchar [not null, note: 'Familia artística: classic, modern, elegant, etc.']
preview_url varchar
thanks_url varchar
is_active boolean
parameters json
sort_order int
created_at timestamp
updated_at timestamp

// Pipeline config
strategy_key varchar [not null, default: 'default']
fal_model varchar
prompt_template text
vision_model varchar
vision_temperature float
description_example text
template_vars json

indexes {
category
is_active
sort_order
(category, is_active)
}

Note: 'Un Style define la config de IA (prompt, modelo fal, parámetros). Es reutilizado por múltiples ProductReferences (ej. "Acuarela" en Póster Acuarela y en Taza Acuarela).'
}

Table style_images {
id varchar [pk]
style_id varchar [not null, ref: > styles.id]
image_url varchar [not null]
storage_key varchar [not null]
caption varchar
order_index int [not null]
is_primary boolean
created_at timestamp

indexes {
style_id
(style_id, order_index)
}
}

// ============================================
// PRODUCT TYPES
// ============================================

Table product_types {
id varchar [pk]
name varchar [not null, unique, note: 'slug: poster, canvas, mug, tshirt, sticker']
display_name varchar [not null, note: 'Póster, Lienzo, Taza, Camiseta, Sticker']
description text
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
}

Note: 'Categoriza el tipo de producto físico. Se puebla vía seed y se deriva de Shopify product_type en el sync.'
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
product_type_id varchar [ref: > product_types.id, note: 'Derivado de Shopify product_type en el sync.']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
is_active
style_id
}

Note: 'Espejo ligero de un producto de Shopify. Cada producto lleva un estilo fijo (style_id) y un tipo (product_type_id). El sync lo crea con style_id = null; un admin lo vincula manualmente. Sin estilo asignado el producto no aparece en el flujo de generación.'
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
// Style            --<  ProductReference     (1 estilo, N productos que lo usan)
// ProductType      --<  ProductReference     (1 tipo, N productos de ese tipo)
// ProductReference --<  ProductFormatVariant (1 producto, N tamaños disponibles)
// Format           --<  ProductFormatVariant (1 formato, N productos que lo ofrecen)
//
// Al crear una Generation:
//   1. El cliente envía: productRefId + formatId
//   2. El backend deriva: styleId = product_references.style_id
//   3. Valida que product_format_variants tenga la fila (productRefId, formatId) activa
//   4. Guarda styleId denormalizado en generations para historial inmutable
