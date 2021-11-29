# This document describes how I created the docker image and object_detection-0.1.tar.gz that is used to run training and evaluation jobs.

November 25, 2021

## Preparing the git branch

1.  Clone the repo
    ```bash
    git clone git@github.com:lizlooney/models.git
    cd models
    git remote add upstream git@github.com:tensorflow/models.git
    ```

1.  Run git log to see what commits are in the master branch.
    ```bash
    git log
    ```

    The output looked like this:
    ```
    commit 65407126c5adc216d606d360429fe12ed3c3f187
    Author: Vighnesh Birodkar <vighneshb@google.com>
    Date:   Tue Nov 23 13:50:18 2021 -0800

        Fix conditional convs by adding ReLU.

        PiperOrigin-RevId: 411887283

    commit c280c4eefe13305a1e6b67c58ecf093ad5a754f0
    Author: A. Unique TensorFlower <gardener@tensorflow.org>
    Date:   Tue Nov 23 09:55:42 2021 -0800

        Internal change

        PiperOrigin-RevId: 411835650

    commit f6557386f8f82eb18a18be91693e4fcdf717fa31
    Author: Frederick Liu <frederickliu@google.com>
    Date:   Mon Nov 22 23:24:37 2021 -0800

        Internal change

        PiperOrigin-RevId: 411729044

    commit 65c81380cb3bcc0f1d0c756dc8fddf39630d90e0
    Author: Fan Yang <fyangf@google.com>
    Date:   Mon Nov 22 17:23:43 2021 -0800

        Internal change.

        PiperOrigin-RevId: 411683806
    ```

1.  Create the branch
    ```bash
    git checkout -b for_fmltc_2021_11_25
    ```

1.  Modify research/object_detection/model_main_tf2.py so the evaluation job does not wait if the next checkpoint is already available.
    ```
    90c90
    <         wait_interval=300, timeout=FLAGS.eval_timeout)
    ---
    >         wait_interval=0, timeout=FLAGS.eval_timeout)
    ```

    ```bash
    git add research/object_detection/model_main_tf2.py
    git commit -m "Set wait_interval to 0 when calling model_lib_v2.eval_continuously."
    ```

1.  Modify research/object_detection/packages/tf2/setup.py to prevent binary incompatibility error.
    ```
    26,28c26,31
    <     # Workaround due to
    <     # https://github.com/keras-team/keras/issues/15583
    <     'keras==2.6.0'
    ---
    >     # Prevent "ValueError: numpy.ndarray size changed, may indicate
    >     # binary incompatibility. Expected 88 from C header, got 80 from
    >     # PyObject". See https://stackoverflow.com/questions/66060487
    >     # # Workaround due to
    >     # # https://github.com/keras-team/keras/issues/15583
    >     # 'keras==2.6.0'
    ```

    ```bash
    git add research/object_detection/packages/tf2/setup.py
    git commit -m "Update setup.py to prevent numpy problem"
    ```

1.  Run git log to see what commits are in the new branch.
    ```bash
    git log
    ```

    The output looked like this:
    ```
    commit 164cf55d364e1b524282983c42c9a3ac2c6ab90c
    Author: lizlooney <lizlooney@google.com>
    Date:   Thu Nov 25 09:28:57 2021 -0800

        Update setup.py to prevent numpy problem

    commit 5915d449455a966bd45569d76a7c1cd4d3b00574
    Author: lizlooney <lizlooney@google.com>
    Date:   Wed Nov 24 14:55:51 2021 -0800

        Set wait_interval to 0 when calling model_lib_v2.eval_continuously.

    commit 65407126c5adc216d606d360429fe12ed3c3f187
    Author: Vighnesh Birodkar <vighneshb@google.com>
    Date:   Tue Nov 23 13:50:18 2021 -0800

        Fix conditional convs by adding ReLU.

        PiperOrigin-RevId: 411887283

    commit c280c4eefe13305a1e6b67c58ecf093ad5a754f0
    Author: A. Unique TensorFlower <gardener@tensorflow.org>
    Date:   Tue Nov 23 09:55:42 2021 -0800

        Internal change

        PiperOrigin-RevId: 411835650
    ```

1.  Push the branch up to github.
    ```bash
    git push origin for_fmltc_2021_11_25
    ```


## Creating the docker image

1.  Build the docker image. Make sure that FMLTC_GCLOUD_PROJECT_ID is set before doing this step.
    ```bash
    export IMAGE_TAG=2021_11_25
    export IMAGE_URI=gcr.io/$FMLTC_GCLOUD_PROJECT_ID/object_detection:$IMAGE_TAG

    cd models/research
    cp object_detection/dockerfiles/tf2_ai_platform/Dockerfile .

    docker build -f Dockerfile -t ${IMAGE_URI} .
    ```

    The partial output looked like this:
    > Successfully installed Cython-0.29.24 absl-py-0.12.0 apache-beam-2.34.0 attrs-21.2.0 avro-python3-1.9.2.1 charset-normalizer-2.0.8 colorama-0.4.4 contextlib2-21.6.0 crcmod-1.7 cycler-0.11.0 dill-0.3.1.1 dm-tree-0.1.6 docopt-0.6.2 fastavro-1.4.7 fonttools-4.28.2 future-0.18.2 gin-config-0.5.0 google-api-core-2.2.2 google-api-python-client-2.31.0 google-auth-httplib2-0.1.0 googleapis-common-protos-1.53.0 hdfs-2.6.0 httplib2-0.19.1 importlib-resources-5.4.0 joblib-1.1.0 kaggle-1.5.12 kiwisolver-1.3.2 lvis-0.5.3 matplotlib-3.5.0 numpy-1.20.3 oauth2client-4.1.3 object-detection-0.1 opencv-python-4.5.4.60 opencv-python-headless-4.5.4.60 orjson-3.6.4 packaging-21.3 pandas-1.3.4 portalocker-2.3.2 promise-2.3 psutil-5.8.0 py-cpuinfo-8.0.0 pyarrow-5.0.0 pycocotools-2.0.3 pydot-1.4.2 pymongo-3.12.1 pyparsing-2.4.7 python-dateutil-2.8.2 python-slugify-5.0.2 pytz-2021.3 pyyaml-6.0 regex-2021.11.10 requests-2.26.0 sacrebleu-2.0.0 scikit-learn-1.0.1 scipy-1.7.3 sentencepiece-0.1.96 seqeval-1.2.2 setuptools-scm-6.3.2 tabulate-0.8.9 tensorflow-addons-0.15.0 tensorflow-datasets-4.4.0 tensorflow-hub-0.12.0 tensorflow-io-0.22.0 tensorflow-io-gcs-filesystem-0.22.0 tensorflow-metadata-1.4.0 tensorflow-model-optimization-0.7.0 tensorflow-text-2.7.3 text-unidecode-1.3 tf-models-official-2.7.0 tf-slim-1.1.0 threadpoolctl-3.0.0 tomli-1.2.2 tqdm-4.62.3 typeguard-2.13.2 uritemplate-4.1.1 zipp-3.6.0 

1.  Push the docker image to Google Cloud Container Registry.
    ```bash
    gcloud auth configure-docker
    docker push ${IMAGE_URI}
    ```

1.  Show the image uri so I can use it in model_trainer.py
    ```bash
    echo "IMAGE_URI is $IMAGE_URI"
    ```


## Creating object_detection-0.1.tar.gz

1.  Create a new python environment
    ```bash
    python3 -m venv models_env
    source models_env/bin/activate
    pip install --upgrade pip
    ```

1.  Compile protos
    ```bash
    cd models/research
    protoc object_detection/protos/*.proto --python_out=.
    ```

1.  Copy the setup.py file.
    ```bash
    cd models/research
    cp object_detection/packages/tf2/setup.py .
    ```

1. Modify models/research/setup.py with the exact versions from the output of docker build.
    ```
    10,31c10,85
    <     # Required for apache-beam with PY3
    <     'avro-python3',
    <     'apache-beam',
    <     'pillow',
    <     'lxml',
    <     'matplotlib',
    <     'Cython',
    <     'contextlib2',
    <     'tf-slim',
    <     'six',
    <     'pycocotools',
    <     'lvis',
    <     'scipy',
    <     'pandas',
    <     'tf-models-official>=2.5.1',
    <     'tensorflow_io',
    <     # Prevent "ValueError: numpy.ndarray size changed, may indicate
    <     # binary incompatibility. Expected 88 from C header, got 80 from
    <     # PyObject". See https://stackoverflow.com/questions/66060487
    <     # # Workaround due to
    <     # # https://github.com/keras-team/keras/issues/15583
    <     # 'keras==2.6.0'
    ---
    >     'Cython==0.29.24',
    >     'absl-py==0.12.0',
    >     'apache-beam==2.34.0',
    >     'attrs==21.2.0',
    >     'avro-python3==1.9.2.1',
    >     'charset-normalizer==2.0.8',
    >     'colorama==0.4.4',
    >     'contextlib2==21.6.0',
    >     'crcmod==1.7',
    >     'cycler==0.11.0',
    >     'dill==0.3.1.1',
    >     'dm-tree==0.1.6',
    >     'docopt==0.6.2',
    >     'fastavro==1.4.7',
    >     'fonttools==4.28.2',
    >     'future==0.18.2',
    >     'gin-config==0.5.0',
    >     'google-api-core==2.2.2',
    >     'google-api-python-client==2.31.0',
    >     'google-auth-httplib2==0.1.0',
    >     'googleapis-common-protos==1.53.0',
    >     'hdfs==2.6.0',
    >     'httplib2==0.19.1',
    >     'importlib-resources==5.4.0',
    >     'joblib==1.1.0',
    >     'kaggle==1.5.12',
    >     'kiwisolver==1.3.2',
    >     'lvis==0.5.3',
    >     'matplotlib==3.5.0',
    >     'numpy==1.20.3',
    >     'oauth2client==4.1.3',
    >     'object-detection==0.1',
    >     'opencv-python==4.5.4.60',
    >     'opencv-python-headless==4.5.4.60',
    >     'orjson==3.6.4',
    >     'packaging==21.3',
    >     'pandas==1.3.4',
    >     'portalocker==2.3.2',
    >     'promise==2.3',
    >     'psutil==5.8.0',
    >     'py-cpuinfo==8.0.0',
    >     'pyarrow==5.0.0',
    >     'pycocotools==2.0.3',
    >     'pydot==1.4.2',
    >     'pymongo==3.12.1',
    >     'pyparsing==2.4.7',
    >     'python-dateutil==2.8.2',
    >     'python-slugify==5.0.2',
    >     'pytz==2021.3',
    >     'pyyaml==6.0',
    >     'regex==2021.11.10',
    >     'requests==2.26.0',
    >     'sacrebleu==2.0.0',
    >     'scikit-learn==1.0.1',
    >     'scipy==1.7.3',
    >     'sentencepiece==0.1.96',
    >     'seqeval==1.2.2',
    >     'setuptools-scm==6.3.2',
    >     'tabulate==0.8.9',
    >     'tensorflow-addons==0.15.0',
    >     'tensorflow-datasets==4.4.0',
    >     'tensorflow-hub==0.12.0',
    >     'tensorflow-io==0.22.0',
    >     'tensorflow-io-gcs-filesystem==0.22.0',
    >     'tensorflow-metadata==1.4.0',
    >     'tensorflow-model-optimization==0.7.0',
    >     'tensorflow-text==2.7.3',
    >     'text-unidecode==1.3',
    >     'tf-models-official==2.7.0',
    >     'tf-slim==1.1.0',
    >     'threadpoolctl==3.0.0',
    >     'tomli==1.2.2',
    >     'tqdm==4.62.3',
    >     'typeguard==2.13.2',
    >     'uritemplate==4.1.1',
    >     'zipp==3.6.0',
    ```

1.  Install the required packages
    ```bash
    pip install Cython==0.29.24
    pip install numpy==1.20.3
    pip install pycocotools==2.0.3
    pip install .
    ```

1. Build object_detection-0.1.tar.gz.
    ```bash
    python3 setup.py sdist
    ```

1. Locate object_detection-0.1.tar.gz.
    ```bash
    ls -l dist/object_detection-0.1.tar.gz
    ```
