# fmltc
FIRST Machine Learning Toolchain

# Usage

Visit this [file](doc/usage.md) for a user guide.

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

1. Enable APIs.
   ```
   gcloud services enable cloudfunctions.googleapis.com
   gcloud services enable ml.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   gcloud services enable compute.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   ```

1. Create a service account, generate a key.json file, and store it as a secret.\
   **Important!** Make sure the current working directory is the fmltc directory when you run these
   commands.
    ```
    gcloud iam service-accounts create ${FMLTC_GCLOUD_PROJECT_ID}-service-account
    gcloud projects add-iam-policy-binding ${FMLTC_GCLOUD_PROJECT_ID} --member "serviceAccount:${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role "roles/owner"
    gcloud iam service-accounts keys create key.json --iam-account ${FMLTC_GCLOUD_PROJECT_ID}-service-account@${FMLTC_GCLOUD_PROJECT_ID}.iam.gserviceaccount.com
    gcloud secrets create key_json --replication-policy="automatic" --data-file="key.json"
    ```

1. Create a secret key for configuring flask. The secret key can be any text you want, but you should keep it private.
   Execute the following commands, replacing `<YOUR-FLASK-SECRET-KEY>` with the key you want to use.
    ```
    echo "<YOUR-FLASK-SECRET-KEY>" >flask_secret_key.txt
    gcloud secrets create flask_secret_key --replication-policy="automatic" --data-file=flask_secret_key.txt
    rm flask_secret_key.txt
    ```

1. Create a secret key for authenticating cloud run requests. The secret key can be any text you want, but you should keep it private.
   Execute the following commands, replacing `<YOUR-CLOUD-RUN-SECRET-KEY>` with the key you want to use.
    ```
    echo "<YOUR-CLOUD-RUN-SECRET-KEY>" >cloud_run_secret_key.txt
    gcloud secrets create cloud_run_secret_key --replication-policy="automatic" --data-file=cloud_run_secret_key.txt
    rm cloud_run_secret_key.txt
    ```

1. Give the App Engine default service account access to the secrets.
   - [ ] Go to https://console.cloud.google.com/iam-admin/iam?project=my_project_id (replace my_project_id with your actual project ID)
   - [ ] Look for the row that shows `App Engine default service account` in the Name column.
   - [ ] At the far right of that row, click on the pencil icon (hint text says `Edit principal`)
   - [ ] Click `+ ADD ANOTHER ROLE`
   - [ ] Under `Select a role`, where it says `Type to filter` enter `secret accessor`
   - [ ] Click `Secret Manager Secret Accessor`
   - [ ] Click SAVE

1. Give the Compute Engine default service account access to the secrets.
   - [ ] Go to https://console.cloud.google.com/iam-admin/iam?project=my_project_id (replace my_project_id with your actual project ID)
   - [ ] Look for the row that shows `Compute Engine default service account` in the Name column.
   - [ ] At the far right of that row, click on the pencil icon (hint text says `Edit principal`)
   - [ ] Click `+ ADD ANOTHER ROLE`
   - [ ] Under `Select a role`, where it says `Type to filter` enter `secret accessor`
   - [ ] Click `Secret Manager Secret Accessor`
   - [ ] Click SAVE

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

1. Create a repository in the Artifact Registry
   - [ ] Run the following command
   ```
   gcloud artifacts repositories create cloud-run --location=us-central1 --repository-format=docker
   ```


## Create and upload the team_info/teams file.
1. Create a text file named `teams` containing one line for each team allowed to use the tools.
   Each line should look like this:
    ```
    <program>,<team number>,<team code>
    ```
   - Program must be FTC or FRC.
   - Team number should be the team number.
   - Team code should be the code that is given to that team. It can contain any characters and can be any length. It is in essence the user password.
   - It can be delimited by either `,` or `, `

   Here's an example
    ```
    FTC, 25,    094e801d
    FTC, 217,   676F6174
    FTC, 4634,  65796573
    FTC, 11115, 6629ab97
    FRC, 67,    8bfef8bf
    FRC, 254,   f929a006
    FRC, 1678,  f67145cf
    ```
1. Go to https://console.cloud.google.com/storage/browser/my_project_id-blobs?project=my_project_id (replace my_project_id with your actual project ID)
1. Click `Create folder`. Enter `team_info` and click `CREATE`.
1. Click `team_info` to go to https://console.cloud.google.com/storage/browser/my_project_id-blobs/team_info/?project=my_project_id (replace my_project_id with your actual project ID)
1. Click `Upload files`. In the file chooser, select your `teams` file.

## Clone the fmltc repo.

1. In a browser, go to https://github.com/FIRST-Tech-Challenge/fmltc
1. Click on the green Code button and figure out which way to clone the repo onto your local machine.
1. After cloning the repo, ```cd fmltc```

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

## Install JDK
Depending on your OS and distribution there are various ways to install JDK. See https://www.oracle.com/java/technologies/downloads/ for instructions. 

## Docker

### Install

Depending on your OS and distribution there are various ways to install Docker. https://docs.docker.com/get-docker/

### Authenticate

```
gcloud auth configure-docker
Do you want to continue (Y/n)?  y
```

## Set Version in server/app.properties

**Important!** Make sure the current working directory is the fmltc root directory when you run these
  commands.

The following command will set the version of fmltc displayed to the user to the current git commit hash.

```
echo "{ \"version\": \"$(git rev-parse --short HEAD)\" }" > server/app.properties
```
If you wish the version to be set to something other than the current git commit hash you can use the following code replacing `<VERSION_NAME>` with the desired name of your version
```
echo "{ \"version\": \"<VERSION_NAME>\" }" > server/app.properties
```

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

1. Deploy the App Engine code.
    ```
    source env_setup.sh
    scripts/deploy_gae.sh
    ```

1. Deploy the object detection docker image.
    ```
    source env_setup.sh
    scripts/deploy_docker_image.sh
    ```

1. Deploy the cloud run image.
    ```
    source env_setup.sh
    scripts/deploy_cloud_run.sh
    ```

## Fill in the values in server/env_variables.yaml

1. Replace `<YOUR-PROJECT-ID>` with the Google Cloud Project ID for your project.
1. Replace `<YOUR-ORIGIN>` with the base URL that will serve the website.
   See comments in server/env_variables.yaml regarding how to find this.
1. Replace `<YOUR-CLOUD-RUN-URL>` with the URL for the cloud run server.
   See comments in server/env_variables.yaml regarding how to fine this.

## Redeploy the App Engine code.
**Important!** Make sure the current working directory is the fmltc directory when you run these
  commands.
    ```
    source env_setup.sh
    scripts/deploy_gae.sh
    ```

## Try it out

Go to the URL you found earlier at https://console.cloud.google.com/appengine?project=YOUR-PROJECT-ID (replace my_project_id with your actual project ID)
