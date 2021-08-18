# fmltc
FIRST Machine Learning Toolchain

# Setup

## Google Cloud

1. Install the Google Cloud SDK
   See https://cloud.google.com/sdk/install for instructions.
1. Create a Google Cloud Project.
   - [ ] Go to https://console.cloud.google.com/home/dashboard
   - [ ] Click `Select a project`
   - [ ] Click `NEW PROJECT`
   - [ ] Enter a project name
   - [ ] Edit the project ID if desired.
   - [ ] Make a note of the project ID.
   - [ ] Click `Create`
1. Enable billing
1. Set the environment variable FMLTC_GCLOUD_PROJECT_ID
    ```
    FMLTC_GCLOUD_PROJECT_ID=<project id>
    export FMLTC_GCLOUD_PROJECT_ID
    ```
1. Set the Google Cloud Project ID
    ```
    gcloud config set project ${FMLTC_GCLOUD_PROJECT_ID}
    ```
1. Create a service account and generate the key.json file.\
   **Important!** Make sure the current working directory is the fmltc directory when you run these
   commands.
    ```
    gcloud iam service-accounts create ${FMLTC_GCLOUD_PROJECT_ID}-service-account
    gcloud projects add-iam-policy-binding ${FMLTC_GCLOUD_PROJECT_ID} --member "serviceAccount:${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role "roles/owner"
    gcloud iam service-accounts keys create key.json --iam-account ${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com
    ```
1. Move key.json to server/key.json
   
1. Enable APIs.
   ```
   gcloud services enable cloudfunctions.googleapis.com
   gcloud services enable ml.googleapis.com
   gcloud services enable compute.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   ```
   
1. Create cloud storage buckets.
    ```
    gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}
    gsutil defacl set public-read gs://${FMLTC_GCLOUD_PROJECT_ID}
    gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}-blobs
    gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}-action-parameters
    ```
   
1. Create the Datastore.
   - [ ] Go to https://console.cloud.google.com/datastore/welcome?project=my_project_id (replace my_project_id with your actual project ID)
   - [ ] Click `SELECT NATIVE MODE`
   - [ ] Click `Select a location` and choose a location.
   - [ ] Click `CREATE DATABASE`
    
1. Grant the ml.serviceAgent role to your TPU service account.
   - [ ] Run the following command
    ```
    curl -H "Authorization: Bearer $(gcloud auth print-access-token)"  \
        https://ml.googleapis.com/v1/projects/${FMLTC_GCLOUD_PROJECT_ID}:getConfig
    ```
   - [ ] Look for the tpuServiceAccount value in the curl command output.
   - [ ] Set the environment variable FMLTC_TPU_SERVICE_ACCOUNT
    ```
    FMLTC_TPU_SERVICE_ACCOUNT=<tpu service account>
    export FMLTC_TPU_SERVICE_ACCOUNT
    ```
   - [ ] Run the following command
    ```
    gcloud projects add-iam-policy-binding ${FMLTC_GCLOUD_PROJECT_ID}  \
        --member serviceAccount:${FMLTC_TPU_SERVICE_ACCOUNT} --role roles/ml.serviceAgent
    ```


## Create and upload the team_info/teams file.
1. Create a text file named `teams` containing one line for each team allowed to use the tools.
   Each line should look like this:
    ```
    <program>,<team number>,<team code>
    ```
   - Program must be FTC or FRC.
   - Team number should be the team number.
   - Team code should be the code that is given to that team. It can contain any characters and can be any length.
   Here's an example
    ```
    FTC, 25,    094e801d
    FTC, 724,   3ac64ab3
    FTC, 3595,  051699ac
    FTC, 11115, 6629ab97
    FRC, 67,    8bfef8bf
    FRC, 254,   f929a006
    FRC, 1678,  f67145cf
    ```
1. Go to https://console.cloud.google.com/storage/browser/my_project_id-blobs?project=my_project_id (replace my_project_id with your actual project ID)
1. Click `Create folder`. Enter `team_info` and click `CREATE`.
1. Click `team_info` to go to https://console.cloud.google.com/storage/browser/my_project_id-blobs/team_info/?project=my_project_id (replace my_project_id with your actual project ID)
1. Click `Upload files`. In the file chooser, select your `teams` file.

## Install the Google Closure Compiler
**Important!** Make sure the current working directory is the fmltc directory when you run these
  commands.
```
mkdir -p ~/tmp_fmltc/
curl -o ~/tmp_fmltc/compiler-20200406.zip https://dl.google.com/closure-compiler/compiler-20200406.zip
mkdir ../closure-compiler
pushd ../closure-compiler
unzip ~/tmp_fmltc/compiler-20200406.zip
popd
```


## Install the Google Closure Library
**Important!** Make sure the current working directory is the fmltc directory when you run these
  commands.
```
mkdir -p ~/tmp_fmltc/
curl -o ~/tmp_fmltc/closure-library_v20200406.zip https://codeload.github.com/google/closure-library/zip/refs/tags/v20200406
mkdir ../closure-library
pushd ../closure-library
unzip ~/tmp_fmltc/closure-library_v20200406.zip
popd
```


## Fill in the values in constants.py

1. Replace `<Project ID>` with the Google Cloud Project ID for our project.
1. Replace `<Secret Key>` with the secret key you want to use to configure flask.
1. Replace `<Origin>` with the base URL that will serve the website.


## Setup the environment.
**Important!** Make sure the current working directory is the fmltc directory when you run these
  commands.
```
source env_setup.sh
```

## Deploy everything.
**Important!** Make sure the current working directory is the fmltc directory when you run these
  commands.

1. Deploy the Datastore indexes.
    ```
    source env_setup.sh
    scripts/deploy_indexes.sh
    ```
1. Deploy the static content (the CSS styles and the favicon).
    ```
    source env_setup.sh
    scripts/deploy_static.sh
    ```
1. Deploy the javascript code.
    ```
    source env_setup.sh
    scripts/deploy_js.sh
    ```
1. Deploy the Cloud Function.
    ```
    source env_setup.sh
    scripts/deploy_cloud_function.sh
    ```
   - If you see the following, enter N.
    ```
    Allow unauthenticated invocations of new function 
    [perform_action]? (y/N)? 
    ```
   - If you see the following, ignore it for now.
    ```
    ERROR: (gcloud.functions.deploy) OperationError: code=3, message=Function failed on loading user code. Error message: Error: memory limit exceeded.
    ```
   - Edit settings for Cloud Function perform_action
      - [ ] Go to https://console.cloud.google.com/functions/list?project=my_project_id (replace my_project_id with your actual project ID)
      - [ ] Click `perform_action`
      - [ ] Click `Edit`
      - [ ] Click `RUNTIME, BUILD AND CONNECTION SETTINGS`
      - [ ] Change Memory allocated to the largest available
      - [ ] Change Timeout to 540
      - [ ] Click `NEXT`
      - [ ] Click `DEPLOY`
1. Deploy the App Engine code.
    ```
    source env_setup.sh
    scripts/deploy_gae.sh
    ```

## Try it out

Go to https://my_project_id.appspot.com  (replace my_project_id with your actual project ID)
