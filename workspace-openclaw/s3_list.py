import boto3
import os
import json
from botocore.config import Config

def main():
    # Detect credentials from env
    access_key = os.getenv('accessKey')
    secret_key = os.getenv('secretKey')
    endpoint_url = os.getenv('endpoint_url')
    bucket_name = os.getenv('bucket')
    region = os.getenv('region')
    prefix = os.getenv('S3_PREFIX') # Optional

    if not all([access_key, secret_key, endpoint_url, bucket_name, region]):
        print(json.dumps({"error": "Missing required S3 configuration environment variables."}))
        return

    try:
        # Initialize S3 client
        s3 = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            endpoint_url=endpoint_url,
            region_name=region,
            config=Config(signature_version='s3v4')
        )

        objects_data = []
        paginator = s3.get_paginator('list_objects_v2')
        
        # Use the prefix if provided
        paginate_kwargs = {'Bucket': bucket_name}
        if prefix:
            paginate_kwargs['Prefix'] = prefix
            
        page_iterator = paginator.paginate(**paginate_kwargs)

        for page in page_iterator:
            if 'Contents' in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    
                    # Calculate directory and filename
                    if '/' in key:
                        prefix_dir = key.rsplit('/', 1)[0]
                        filename = key.rsplit('/', 1)[1]
                    else:
                        prefix_dir = ''
                        filename = key
                    
                    extension = filename.split('.')[-1] if '.' in filename else ''

                    # Get head_object for more metadata (Content-Type, Storage Class)
                    # Note: This adds one API call per object. 
                    # For huge buckets, this is slow. 
                    # But user asked for "Content type, when available" and "Storage class".
                    # list_objects_v2 provides StorageClass, but not Content-Type.
                    
                    head = s3.head_object(Bucket=bucket_name, Key=key)
                    
                    objects_data.append({
                        "object_key": key,
                        "filename": filename,
                        "prefix": prefix_dir,
                        "extension": extension,
                        "size": obj['Size'],
                        "last_modified": obj['LastModified'].isoformat(),
                        "etag": obj['ETag'],
                        "content_type": head.get('ContentType'),
                        "storage_class": obj.get('StorageClass', head.get('StorageClass'))
                    })

        print(json.dumps(objects_data, indent=2))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
