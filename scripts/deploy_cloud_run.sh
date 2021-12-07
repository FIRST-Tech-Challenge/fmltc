if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi

FMLTC_ORIGIN=$(gcloud app browse --no-launch-browser)

pushd server

# Save the Dockerfile and cloudbuild.yaml files which are used by the github action.
mv Dockerfile save_Dockerfile
mv cloudbuild.yaml save_cloudbuild.yaml
cp cloud_run/Dockerfile ./Dockerfile

IMAGE=us-central1-docker.pkg.dev/$FMLTC_GCLOUD_PROJECT_ID/cloud-run/server

# Check whether there is already an image with the latest tag.
COUNT_PREVIOUS_IMAGE=$(gcloud artifacts docker tags list $IMAGE 2>/dev/null |grep latest |wc -l)
if [ $COUNT_PREVIOUS_IMAGE -eq 1 ]; then
  # Add the tag previous to the latest image so we can deleted it later.
  gcloud artifacts docker tags add $IMAGE:latest $IMAGE:previous
  PREVIOUS_IMAGE=$IMAGE:previous
fi

# Check whether there is already a revision.
COUNT_PREVIOUS_REVISION=$(gcloud run revisions list --service server --format="get(metadata.name)" |wc -l)
if [ $COUNT_PREVIOUS_REVISION -eq 1 ]; then
  # Add another tag to the latest image so we can deleted it later.
  PREVIOUS_REVISION=$(gcloud run revisions list --service server --format="get(metadata.name)")
fi

# Build the image.
gcloud builds submit . \
    --tag $IMAGE:latest \
    --ignore-file=.cloud_run_ignore
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Deploy the image.
  gcloud run deploy server \
      --image $IMAGE:latest \
      --timeout=60s \
      --memory=4Gi \
      --set-env-vars=PROJECT_ID=$FMLTC_GCLOUD_PROJECT_ID,ORIGIN=$FMLTC_ORIGIN \
      --allow-unauthenticated \
      --region=us-central1
  EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
  if [ $COUNT_PREVIOUS_IMAGE -eq 1 ]; then
    # Delete the previous image.
    gcloud artifacts docker images delete $PREVIOUS_IMAGE --quiet
  fi

  if [ $COUNT_PREVIOUS_REVISION -eq 1 ]; then
    # Delete the previous revision.
    gcloud run revisions delete $PREVIOUS_REVISION --quiet
  fi
fi

# Restore the Dockerfile and cloudbuild.yaml files which are used by the github action.
mv save_Dockerfile Dockerfile
mv save_cloudbuild.yaml cloudbuild.yaml

popd
