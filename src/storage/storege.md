# 💾 Storage Module

Internal service for managing file persistence, specifically designed for handling pet photos and generated assets.

## 📁 Files Structure

- `storage/storage.service.ts`: Core service for interacting with cloud storage providers.

## 🛠️ Features

- **Cloud Integration**: Full **AWS S3** support using the latest **AWS SDK v3**.
- **Smart Uploads**: Automatic detecting of content types for correct metadata storage.
- **Life Cycle Management**: Methods for both secure file upload and permanent deletion.
- **Resource Access**: Dynamic generation of public URLs for easy content delivery.
- **Asset Isolation**: Logic for organizing files by user and asset type.

## ⚙️ Technical Details

- **Provider**: AWS S3 (Scalable Object Storage).
- **Security**: Environment-based configuration for credentials and bucket names.
- **Efficiency**: Stream-based uploads for handling large assets without high memory overhead.
