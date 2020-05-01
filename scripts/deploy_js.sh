if [[ "${FMLTC_CLOSURE_COMPILER_JAR}" == "" ]] ||
   [[ "${FMLTC_CLOSURE_LIBRARY_FOLDER}" == "" ]] ||
   [[ "${FMLTC_GCLOUD_PROJECT_ID}" == "" ]]; then
  echo "ERROR: environment is not setup correctly. Please run 'source env_setup.sh'."
  exit 1
fi


echo "Running closure compiler"
java -jar $FMLTC_CLOSURE_COMPILER_JAR \
  --js src/js/**.js \
  --js $FMLTC_CLOSURE_LIBRARY_FOLDER/closure/goog/base.js \
  --js $FMLTC_CLOSURE_LIBRARY_FOLDER/closure/goog/deps.js \
  --only_closure_dependencies \
  --entry_point fmltc.Box \
  --entry_point fmltc.LabelVideo \
  --entry_point fmltc.ListDatasets \
  --entry_point fmltc.ListVideos \
  --entry_point fmltc.Point \
  --entry_point fmltc.ProduceDatasetDialog \
  --entry_point fmltc.UploadVideoFileDialog \
  --entry_point fmltc.Util \
  --js_output_file compiled/js/fmltc_tmp.js
if [ $? -ne 0 ]; then
  exit 1
fi
echo "const BUILD_TIME = '$(date)';" > compiled/js/fmltc.js
echo "console.log('BUILD_TIME is ' + BUILD_TIME);" >> compiled/js/fmltc.js

cat compiled/js/fmltc_tmp.js >> compiled/js/fmltc.js
rm compiled/js/fmltc_tmp.js

gsutil -m rsync -r ./compiled gs://${FMLTC_GCLOUD_PROJECT_ID}/compiled
