docker pull ghcr.io/lizlooney/object_detection:2021_11_25
docker tag ghcr.io/lizlooney/object_detection:2021_11_25 gcr.io/${FMLTC_GCLOUD_PROJECT_ID}/object_detection:2021_11_25
docker push gcr.io/${FMLTC_GCLOUD_PROJECT_ID}/object_detection:2021_11_25
