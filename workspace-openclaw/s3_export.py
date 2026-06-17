import os
import boto3
from botocore.client import Config

# Credentials from env
ACCESS_KEY = 'RK31ZXT1ZKO6RJQRE06Y'
SECRET_KEY = 'TeP4HkM8zqkEORMWS4jplCMMsUoVhqBbGQFnQ6CO'
ENDPOINT_URL = 'https://hcm04.vstorage.vngcloud.vn'
BUCKET_NAME = 'review-123'
REGION = 'hcm04'
SOURCE_DIR = '/root/.openclaw'
S3_PREFIX = 'openclw'

def upload_to_s3():
    # Initialize S3 client
    s3 = boto3.client(
        's3',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        endpoint_url=ENDPOINT_URL,
        config=Config(signature_version='s3v4'),
        region_name=REGION
    )

    print(f"Starting upload of {SOURCE_DIR} to s3://{BUCKET_NAME}/{S3_PREFIX}/")

    for root, dirs, files in os.walk(SOURCE_DIR):
        for file in files:
            local_path = os.path.join(root, file)
            
            # Calculate S3 key (relative path)
            relative_path = os.path.relpath(local_path, SOURCE_DIR)
            s3_key = os.path.join(S3_PREFIX, relative_path).replace(os.sep, '/')

            try:
                print(f"Uploading {local_path} -> {s3_key}...")
                s3.upload_file(local_path, BUCKET_NAME, s3_key)
            except Exception as e:
                print(f"Error uploading {local_path}: {e}")

    print("Upload complete!")

if __name__ == "__main__":
    upload_to_s3()
