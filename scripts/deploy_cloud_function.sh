if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


pushd server
gcloud functions deploy perform_action \
    --runtime=python39 \
    --set-env-vars=PROJECT_ID=${FMLTC_GCLOUD_PROJECT_ID} \
    --memory=8192MB \
    --timeout=540 \
    --trigger-resource=${FMLTC_GCLOUD_PROJECT_ID}-action-parameters \
    --trigger-event=google.storage.object.finalize \
    --ignore-file=.cloud_function_ignore
popd
