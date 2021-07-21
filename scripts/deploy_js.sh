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
  --entry_point fmltc.DeleteConfirmationDialog \
  --entry_point fmltc.DeleteForbiddenDialog \
  --entry_point fmltc.DownloadDatasetDialog \
  --entry_point fmltc.DownloadModelDialog \
  --entry_point fmltc.LabelVideo \
  --entry_point fmltc.ListDatasets \
  --entry_point fmltc.ListModels \
  --entry_point fmltc.ListVideos \
  --entry_point fmltc.MonitorTraining \
  --entry_point fmltc.Point \
  --entry_point fmltc.ProduceDatasetDialog \
  --entry_point fmltc.StartTrainingDialog \
  --entry_point fmltc.TrainMoreDialog \
  --entry_point fmltc.UploadVideoFileDialog \
  --entry_point fmltc.Util \
  --js_output_file compiled/js/fmltc_tmp.js
if [ $? -ne 0 ]; then
  exit 1
fi
# The following way to get the current time in millis works on Linux and OSX.
BUILD_TIME=$(($(date +'%s * 1000 + %-N / 1000000')))
echo "console.log('Build time is ' + new Date($BUILD_TIME).toLocaleString());" > compiled/js/fmltc.js
echo "console.log('Load  time is ' + new Date().toLocaleString());" >> compiled/js/fmltc.js

cat compiled/js/fmltc_tmp.js >> compiled/js/fmltc.js
rm compiled/js/fmltc_tmp.js

gsutil -m rsync -r ./compiled gs://${FMLTC_GCLOUD_PROJECT_ID}/compiled
