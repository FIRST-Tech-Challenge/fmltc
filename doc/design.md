# **FIRST Machine Learning Toolchain**

The goal of the project is to deliver the source code for a web-based set of
tools that allow a FIRST Tech Challenge (FTC) or FIRST Robotics Competition
(FRC) team to  generate a custom TensorFlow inference model for object
detection and tracking.

The target platform for the project is Google Cloud:
 * App Engine for hosting the web application
 * Cloud Functions for operations that take longer than 30 seconds
 * Cloud Datastore/Firestore for storing entities
   + Application entities
     + Team entities
     + Tracker entities
     + DatasetRecordWriter entities
     + DatasetZipper entities
   + User entities
     + Video entities
     + VideoFrame entities
     + Dataset entities
     + DatasetRecord entities
 * Cloud Storage for storing files
   + Application files
     + javascript files
     + css files
     + files to trigger Cloud Functions
     + Object Detection package files
     + SSD MobileNet checkpoint files
   + User files
     + Video files
     + Image files
     + TensorFlow Record files
     + files for the TensorFlow Model


The steps involved in generating the model are:
1. Upload videos
2. Label objects in video frame images with assistance from object tracking
3. Produce TensorFlow records from the labeled images
4. Train a TensorFlow model
5. Convert the model to TFLite format


# Login page

When a user visits the website for the first time, they are presented with a
login page.

<img src="images/login.png" width="192">

The user selects their FIRST program, enters their team number and team code,
and clicks Submit.

<img src="images/login_ftc.png" width="192"><img src="images/white_pixel.png" width="100"><img src="images/black_pixel.png" width="1" height="194"><img src="images/white_pixel.png" width="100"><img src="images/login_frc.png" width="192">

<details>
<summary>Internal Details</summary>

> When the users clicks Submit:
> * the client:
>   * sends a /login request to the server
>   * the server, receiving the /login request:
>     * reads the teams file from Cloud Storage
>     * looks for a line with matching FIRST program, team number, and team code
>     * if the team is found:
>       * stores the values in the session so the user doesn't have to login
>         next time on the same machine
>       * responds with a redirect to the main page
>     * if the team is not found:
>       * responds with the login page with an error message
</details>


# Main page

After the user logs in, the main page appears. There are three tabs
 * Videos - show the videos that this team has uploaded
 * Datasets - show the datasets that this team has produced
 * Models - show the TensorFlow models that this team has generated

## Videos tab

At first, since the team has not yet uploaded any videos, the Videos tab looks like this:

<img src="images/videos_tab_empty.png" width="1173">

### Uploading a Video

When the user clicks Upload Video, they are presented with the Upload Video File dialog:

<img src="images/upload_video_file.png" width="566">

The user chooses a file, enters a description, and clicks Upload.

<img src="images/upload_video_file_before_upload.png" width="622">

As the file is uploaded, a progress bar is updated.

<img src="images/upload_video_file_progress.png" width="615">

When the upload has finished, the dialog is dismissed.

<details>
<summary>Internal Details</summary>

> When the users clicks Upload:
> * the client:
>   * sends a /prepareToUploadVideo request to the server
>   * the server, receiving the /prepareToUploadVideo request:
>     * creates a unique id for the video
>     * generates a signed url for uploading the video file to Cloud Storage
>     * inserts a video entity into Cloud Datastore/Firestore, setting the
>       team_uuid, video_uuid, description, video_filename, file_size,
>       video_content_type, create_time, and video_blob_name fields
>     * triggers the start of a Cloud Function that will extract the frames of
>       the video
>     * updates the video entity, setting the frame_extraction_triggered_time
>       field
>     * responds with the video id and the upload url
>
> * the client:
>   * sends the video file to the upload url
>
> * the Cloud Function:
>   * reads the video file from Cloud Storage and writes it to a temporary file,
>     waiting until the video file has finished uploading if necessary
>   * opens the temporary file with OpenCV
>   * determines the number of frames in the video
>   * inserts video frame entities into in Cloud Datastore/Firestore, setting
>     the team_uuid, video_uuid, frame_number, and include_frame_in_dataset
>     fields
>   * updates the video entity, setting the width, height, fps (frames per
>     second), frame_count, and frame_extraction_start_time fields
>   * repeats the following until it reaches the end of the video
>     * reads a frame of the video
>     * writes the video frames as jpeg image files in Cloud Storage
>     * updates the video frame entity, setting the content_type and
>       image_blob_name fields
>     * updates the video entity, setting the extracted_frame_count,
>       included_frame_count, and frame_extraction_active_time fields
>     * checks how long it has been running:
>       * if it is within 70 seconds of the estimated time limit, triggers the
>         start of another Cloud Function to continue extracting frames
>       * if it is within 30 seconds of the estimated time limit, terminates
>   * before termination, deletes the temporary file
>
> * the client:
>   * periodically sends a /retrieveVideoEntity request to the the server to
>     determine the progress of frame extraction
>   * the server, receiving the /retrieveVideoEntity request:
>     * responds with the video entity
</details>

<img src="images/videos_tab_frame_extraction.png" width="1283">

When frame extraction is complete, the description becomes a clickable link. To
label the objects in a video, the user clicks on the description for that video.

<img src="images/video_link.png" width="1282">


### Labeling a Video

The Video Frame Labeling page allows the user to view the frames of the video
and the labeled objects.

<img src="images/label_video_1.png" width="1245">

As shown in the image above, the user can:
 * adjust the size of the frame viewer
 * navigate through the frames of the video
 * find frames that have not been labeled
 * play the video forward or reverse
 * exclude a frame from datasets made from the video in the future

<details>
<summary>Internal Details</summary>

> When the Video Frame Labeling page is loaded:
> * the client:
>   * sends one or more /retrieveVideoFrameEntitiesWithImageUrls requests to the server.
>     Each request asks for up to 100 video frame entities.
>   * the server, receiving the /retrieveVideoFrameEntitiesWithImageUrls requests:
>     * generates a signed url for each frame image requested
>     * responds with the video frame entities, with each entity containing a
>       signed url for requesting the image from Cloud Storage.
> * the client:
>   * requests the images from Cloud Storage using the signed urls
</details>

The progress bar on the upper right area of the page indicates how many entities
and images have been received. If the user navigates to a frame whose image has
not been received yet, the frame viewer will be blank.

The following buttons remain disabled until all frame entities have been
received:
  * the buttons that find frames that have not been labeled
  * the button that starts tracking

#### Drawing a Box and Entering a Label

To label an object on the frame, the user clicks the mouse in the frame viewer,
at the upper-left corner of the object, holds the mouse button down and drags to
the lower-right corner, and then releases the mouse button. A new row is added
to the table on the right side and the user enters a label for the object.

<img src="images/draw_box_enter_label.png" width="1245">

The user should use consistent labels for the objects. For example, in the video
shown here, all wiffle balls will be labeled "w".

<details>
<summary>Internal Details</summary>

> Each time a box or label is created or modified:
> * the client:
>   * sends a /storeVideoFrameBboxesText request to the server
>   * the server, receiving the /storeVideoFrameBboxesText request:
>     * updates the video frame entity, setting the bboxes_text field
>     * updates the video entity, setting the labeled_frame_count field
</details>

#### Tracking

Once all objects on the first frame are labeled, the user can use the tracking
feature to label the rest of the frames. There are several algorithms available
for tracking. The default algorithm is CSRT (discriminative correlation filter
tracker with channel and spatial reliability) and it provides high accuracy and
is relatively quick.

<img src="images/start_tracking.png" width="1240">

To start tracking, the user clicks the start tracking button.

The tracker can take up to 30 seconds to begin processing the video frames.
Once it starts, the frame viewer will navigate through the frames and show
the tracked boxes. If the boxes aren't accurately placed, the user can click
the Pause Tracking button to pause the tracker and then they can adjust the
boxes.

<img src="images/pause_tracking.png" width="234">

The user can click the Continue Tracking button to continue tracking
or click the Stop Tracking button to stop tracking.

<img src="images/continue_tracking.png" width="236">

<details>
<summary>Internal Details</summary>

> When the user clicks the start tracking button:
> * the client sends a /prepareToStartTracking request to the server
>   * the server, receiving the /prepareToStartTracking request:
>     * creates a unique id for the tracker
>     * inserts a tracker entity into Cloud Datastore/Firestore, setting the
>       team_uuid, video_uuid, tracker_uuid, update_time, video_blob_name,
>       tracker_name, scale, frame_number, and bboxes_text fields
>     * inserts a tracker client entity into Cloud Datastore/Firestore, setting
>       the team_uuid, video_uuid, tracker_uuid, update_time, frame_number,
>       bboxes_text, and tracking_stop_requested fields
>     * updates the video entity, setting the tracking_in_progress and 
>       tracker_uuid fields
>     * triggers the start of a Cloud Function that will track objects in the
>       video
>     * responds with the tracker id.
>
> * the Cloud Function:
>   * reads the video file from Cloud Storage and writes it to a temporary file
>   * opens the temporary file with OpenCV
>   * reads a frame of the video
>   * create one OpenCV tracker for each box drawn on the video frame
>   * repeats the following until it reaches the end of the video
>     * reads another frame of the video
>     * passes the new frame to each tracker and gets the new bounding box
>     * updates the tracker entity, setting the frame_number, bboxes_text, and
>       update_time fields
>     * waits for the bounding boxes to be approved or adjusted by the client
>     * checks whether the tracker client entity indicates that the user has
>       pressed the stop tracking button and if so:
>       * removes the tracker id from the video entity
>       * deletes the tracker and tracker client entities from Cloud
>         Datastore/Firestore
>       * terminates
>     * checks whether the tracker client entity has not been updated in over
>       two minutes and if so:
>       * assumes the user has closed the browser window
>       * removes the tracker id from the video entity
>       * deletes the tracker and tracker client entities from Cloud
>         Datastore/Firestore
>       * terminates
>     * checks how long it has been running:
>       * if it is within 70 seconds of the estimated time limit, triggers the
>         start of another Cloud Function to continue tracking objects
>       * if it is within 30 seconds of the estimated time limit, terminates
>   * before termination, deletes the temporary file
>
> * the client:
>   * repeats the following until tracking is finished
>     * sends a /retrieveTrackedBboxes (initially) or a /continueTracking
>       (subsequently) request to the server
>     * the server, receiving the  /retrieveTrackedBboxes or /continueTracking
>       request:
>       * writes the current time in the tracker client entity in Cloud
>         Datastore/Firestore
>       * checks whether the tracker entity has not been updated in over two
>         minutes and if so:
>         * assumes the tracker failed
>         * updates the video entity, clearing the tracking_in_progress and
>           tracker_uuid fields
>         * deletes the tracker and tracker client entities from Cloud
>           Datastore/Firestore
>       * responds with the most recent boxes from the tracker or whether the
>         tracker failed
>     * if the user presses the stop button, sends a /stopTracking request to
>       the server
>     * the server, receiving the /stopTracking request:
>       * updates the tracker client entity, setting the tracking_stop_requested
>         field
>     * periodically sends a /trackingClientStillAlive request to the server
>     * the server, receiving the /trackingClientStillAlive request:
>       * writes the current time in the tracker client entity in Cloud
>         Datastore/Firestore
>


</details>

### Creating a Dataset

### Deleting a Video

## Datasets tab

### Training a Model

### Deleting a Dataset

## Models tab

### Monitoring Model Training

### More Training

### Deleting a Model
