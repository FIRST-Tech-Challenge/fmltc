if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


gsutil -m rsync -r ./server/static gs://${FMLTC_GCLOUD_PROJECT_ID}/static
