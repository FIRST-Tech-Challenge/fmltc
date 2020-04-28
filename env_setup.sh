# Check that gcloud is available.
which gcloud >/dev/null
if [ $? -ne 0 ]; then
  echo "Please install the Google Cloud SDK."
  exit 1
fi

# Check that the Google Cloud project id is set.
FMLTC_GCLOUD_PROJECT_ID=$(gcloud config list --format='text(core.project)' 2>/dev/null | grep ^core.project: | colrm 1 14)
if [ "$FMLTC_GCLOUD_PROJECT_ID" != "" ]; then
  export FMLTC_GCLOUD_PROJECT_ID
  echo "FMLTC_GCLOUD_PROJECT_ID is $FMLTC_GCLOUD_PROJECT_ID"
else
  echo "Please set the Google Cloud Project ID."
  exit 1
fi

# Locate the Google Closure Compiler.
if [ -f ../closure-compiler/closure-compiler*.jar ]; then
  FMLTC_CLOSURE_COMPILER_JAR="../closure-compiler/closure-compiler*.jar"
  export FMLTC_CLOSURE_COMPILER_JAR
  echo "FMLTC_CLOSURE_COMPILER_JAR is $FMLTC_CLOSURE_COMPILER_JAR"
else
  echo "Please install the Google Closure Compiler"
  exit 1
fi

# Locate the Google Closure Library.
if [ -f ../closure-library/closure-library-master/closure/goog/base.js ]; then
  FMLTC_CLOSURE_LIBRARY_FOLDER="../closure-library/closure-library-master"
  export FMLTC_CLOSURE_LIBRARY_FOLDER
  echo "FMLTC_CLOSURE_LIBRARY_FOLDER is $FMLTC_CLOSURE_LIBRARY_FOLDER"
else
  echo "Please install the Google Closure Library"
  exit 1
fi
