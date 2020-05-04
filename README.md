# fmltc
FIRST Machine Learning Toolchain

# Setup

## Google Cloud

1. Install the Google Cloud SDK
   See https://cloud.google.com/sdk/install for instructions.
2. Create a Google Cloud Project.
   - [ ] Go to https://console.cloud.google.com/home/dashboard
   - [ ] Click `Select a project`
   - [ ] Click `NEW PROJECT`
   - [ ] Enter a project name
   - [ ] Edit the project ID if desired.
   - [ ] Make a note of the project ID.
   - [ ] Click `Create`
3. Enable billing
4. Set the environment variable FMLTC_GCLOUD_PROJECT_ID
```
FMLTC_GCLOUD_PROJECT_ID=<project id>
export FMLTC_GCLOUD_PROJECT_ID
```
5. Set the Google Cloud Project ID
```
gcloud config set project ${FMLTC_GCLOUD_PROJECT_ID}
```
6. Create a service account and generate the key.json file.\
   **Important!** Make sure the current working directory is the fmltc directory when you run these
   commands.
```
gcloud iam service-accounts create ${FMLTC_GCLOUD_PROJECT_ID}-service-account
gcloud projects add-iam-policy-binding ${FMLTC_GCLOUD_PROJECT_ID} --member "serviceAccount:${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role "roles/owner"
gcloud iam service-accounts keys create key.json --iam-account ${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com
```
7. Enable APIs.
   - [ ] Go to https://console.cloud.google.com/apis/library
   - [ ] Enable Cloud Functions API, if it is not already enabled.
   - [ ] Enable Cloud Storage, if it is not already enabled.
   - [ ] Enable Cloud Datastore API, if it is not already enabled.
8. Create cloud storage buckets.
```
gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}
gsutil defacl set public-read gs://${FMLTC_GCLOUD_PROJECT_ID}
gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}-blobs
gsutil mb -c standard gs://${FMLTC_GCLOUD_PROJECT_ID}-action-parameters
```
9. Create the Datastore.
   - [ ] Go to https://console.cloud.google.com/datastore/welcome?project=my_project_id (replace my_project_id with your actual project ID)
   - [ ] Click `SELECT NATIVE MODE`
   - [ ] Click `Select a location` and choose a location.
   - [ ] Click `CREATE DATABASE`


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
2. Go to https://console.cloud.google.com/storage/browser/my_project_id?project=my_project_id (replace my_project_id with your actual project ID)
3. Click `Create folder`. Enter `team_info` and click `CREATE`.
4. Click `team_info` to go to https://console.cloud.google.com/storage/browser/my_project_id/team_info/?project=my_project_id (replace my_project_id with your actual project ID)
5. Click `Upload files`. In the file chooser, select your `teams` file.
6. After the file is uploaded, click on the vertical ellipsis and choose `Edit permissions`.
7. Remove `allUsers` by clicking the X at the end of that row.
8. Click `Add item`.
   For Entity, select `User`.
   For Name, enter `my_project_id-service-account@my_project_id.iam.gserviceaccount.com`. (replace my_project_id with your actual project ID)
   For Access, select `Reader`.
   Click `Save`

## Install the Google Closure Compiler

```
curl -o ~/tmp/compiler-latest.zip https://dl.google.com/closure-compiler/compiler-latest.zip
mkdir ../closure-compiler
cd ../closure-compiler
unzip ~/tmp/compiler-latest.zip
```


## Install the Google Closure Library

```
curl -o ~/tmp/closure-library.zip https://codeload.github.com/google/closure-library/zip/master
mkdir ../closure-library
cd ../closure-library
unzip ~/tmp/closure-library.zip
```


## Fill in the values in constants.py

1. Replace `<Project ID>` with the Google Cloud Project ID for our project.
2. Replace `<Secret Key>` with the secret key you want to use to configure flask.
3. For now, leave `REGION` set to `us-central1`.


## Setup the environment.

```
source env_setup.sh
```

## Deploy everything.

1. Deploy the Datastore indexes.
```
source env_setup.sh
scripts/deploy_indexes.sh
```
2. Deploy the static content (the CSS styles and the favicon).
```
source env_setup.sh
scripts/deploy_static.sh
```
3. Deploy the javascript code.
```
source env_setup.sh
scripts/deploy_js.sh
```
4. Deploy the Cloud Functions.
```
source env_setup.sh
scripts/deploy_cloud_functions.sh
```
   - If you see the following, enter y.
```
Allow unauthenticated invocations of new function 
[http_perform_action]? (y/N)? 
```
   - If you see the following, enter y.
```
Allow unauthenticated invocations of new function 
[perform_action]? (y/N)? 
```
   - If you see the following, ignore it for now.
```
ERROR: (gcloud.functions.deploy) OperationError: code=3, message=Function failed on loading user code. Error message: Error: memory limit exceeded.
```
   - Edit settings for Cloud Function http_perform_action
      - [ ] Go to https://console.cloud.google.com/functions/list?project=my_project_id (replace my_project_id with your actual project ID)
      - [ ] Click `http_perform_action`
      - [ ] Look for `Region`. Make a note of the `Region` value shown here.
      - [ ] Click `Edit`
      - [ ] Change Memory allocated to 2 GiB
      - [ ] Click `ENVIRONMENT VARIABLES, NETWORKING, TIMEOUTS AND MORE`
      - [ ] Change Timeout to 540
      - [ ] Click `DEPLOY`
      - [ ] Go to https://console.cloud.google.com/functions/list?project=my_project_id (replace my_project_id with your actual project ID)
   - Edit settings for Cloud Function perform_action
      - [ ] Click `perform_action`
      - [ ] Click `Edit`
      - [ ] Change Memory allocated to 2 GiB
      - [ ] Click `ENVIRONMENT VARIABLES, NETWORKING, TIMEOUTS AND MORE`
      - [ ] Change Timeout to 540
      - [ ] Click `DEPLOY`
5. Update the REGION value in constants.py
   - In the Deploy the Cloud Functions step above, you made a note of the `Region` value for the
     http_perform_action Cloud Function shown in the Google Cloud Platform console.
   - **Important!** If the value was not `us-central1`, you must modify constants.py before deploying the App Engine code.
   - [ ] In constants.py, look for `REGION = 'us-central1'` and replace `us-central1` with the correct region.
6. Deploy the App Engine code.
```
source env_setup.sh
scripts/deploy_gae.sh
```

## Try it out

Go to https://my_project_id.appspot.com  (replace my_project_id with your actual project ID)
