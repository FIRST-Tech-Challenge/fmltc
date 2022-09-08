if [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


pushd server/app_engine
gcloud -q app deploy \
    --ignore-file=.app_engine_ignore \
    --appyaml=app.yaml \
    --version v1
popd
