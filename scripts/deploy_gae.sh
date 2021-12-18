if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


pushd server
gcloud -q app deploy \
    --version v1 \
    --appyaml=app.yaml \
    --ignore-file=.app_engine_ignore
popd