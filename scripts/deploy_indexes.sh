if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


if [ "index.yaml" -nt ".index_updated" ]; then
  gcloud -q datastore indexes create index.yaml
  touch .index_updated
fi
