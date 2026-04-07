// ClawAndSoul - AI Pet Portrait E-Commerce Platform
// Database Schema v2.0
// Updated: April 2026

// ============================================
// AUTHENTICATION & USERS
// ============================================

Table users {
id varchar [pk]
email varchar [not null, unique]
password_hash varchar [not null]
full_name varchar
role varchar
email_verified boolean
is_active boolean
last_login_at timestamp
created_at timestamp
updated_at timestamp
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
species varchar [not null]
breed varchar
age int
description text
is_active boolean
created_at timestamp
updated_at timestamp
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
name varchar [not null]
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
name varchar [not null, unique, note: 'slug: square, portrait, landscape_wide']
display_name varchar [not null]
aspect_ratio varchar [not null, note: '1:1, 16:9, 3:4, etc.']
width int [not null, note: 'base width in px for generation']
height int [not null, note: 'base height in px for generation']
is_active boolean
created_at timestamp
updated_at timestamp
}

Table product_references {
id varchar [pk]
shopify_product_id varchar [not null, unique, note: 'Shopify product ID reference']
name varchar [not null, note: 'slug: poster, puzzle, canvas']
display_name varchar [not null]
description text
is_active boolean
created_at timestamp
updated_at timestamp
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
format_id varchar [not null, ref: > formats.id]
product_ref_id varchar [not null, ref: > product_references.id]
type varchar [not null]
status varchar
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
