// ClawAndSoul - AI Pet Portrait E-Commerce Platform
// Database Schema v3.1
// Updated: April 9, 2026

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
token varchar [not null]
expires_at timestamp [not null]
is_revoked boolean
created_at timestamp
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
}

// ============================================
// STYLES & STYLE IMAGES
// ============================================

Table styles {
id varchar [pk]
name varchar [not null, unique]
display_name varchar [not null]
description text
category varchar [not null]
preview_url varchar
is_active boolean
is_premium boolean
parameters json
sort_order int
created_at timestamp
updated_at timestamp

indexes {
category
is_active
sort_order
(category, is_active)
}
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
}

// ============================================
// FORMATS & PRODUCT REFERENCES
// ============================================

Table formats {
id varchar [pk]
name varchar [not null, unique, note: 'slug: portrait_8x10, portrait_12x16, museum_20x25, etc.']
display_name varchar [not null]
aspect_ratio varchar [not null, note: '4:5, 3:4, 2:3, etc.']
width int [not null, note: 'width in px at 300 DPI']
height int [not null, note: 'height in px at 300 DPI']
shopify_variant_option varchar [note: 'exact Shopify option string for auto-matching, e.g. 8″×10″']
is_active boolean
created_at timestamp
updated_at timestamp
}

Table product_references {
id varchar [pk]
shopify_product_id varchar [not null, unique, note: 'numeric Shopify product ID']
shopify_handle varchar [note: 'Shopify product handle, e.g. framed-canvas']
name varchar [not null, note: 'slug derived from Shopify handle']
display_name varchar [not null]
description text
is_active boolean
created_at timestamp
updated_at timestamp
}

Table product_format_variants {
id varchar [pk]
product_ref_id varchar [not null, ref: > product_references.id]
format_id varchar [not null, ref: > formats.id]
shopify_variant_id varchar [not null, note: 'numeric Shopify variant ID']
shopify_variant_title varchar [not null, note: 'e.g. Black / 12″×16″']
is_active boolean
created_at timestamp
updated_at timestamp

indexes {
(product_ref_id, format_id) [unique]
shopify_variant_id
}
}

// ============================================
// COMPATIBILITY MATRIX
// ============================================

Table style_format_product_compat {
id varchar [pk]
style_id varchar [not null, ref: > styles.id]
format_id varchar [not null, ref: > formats.id]
product_ref_id varchar [not null, ref: > product_references.id]
constraints json [note: 'Future: min resolution, max size, etc.']
is_active boolean
created_at timestamp

indexes {
(style_id, format_id, product_ref_id) [unique]
style_id
format_id
}
}

// ============================================
// GENERATIONS
// ============================================

Table generations {
id varchar [pk]
user_id varchar [not null, ref: > users.id]
pet_id varchar [not null, ref: > pets.id]
pet_photo_id varchar [ref: > pet_photos.id]
style_id varchar [not null, ref: > styles.id]
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
