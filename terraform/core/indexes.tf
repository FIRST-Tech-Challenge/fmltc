resource "google_datastore_index" "team1" {
  kind = "Team"
  properties {
    name = "program"
    direction = "ASCENDING"
  }
  properties {
    name = "team_number"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "team2" {
  kind = "Team"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "last_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.team1]
}

resource "google_datastore_index" "video1" {
  kind = "Video"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "video_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "video2" {
  kind = "Video"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.video1]
}

resource "google_datastore_index" "video3" {
  kind = "Video"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "delete_in_progress"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.video2]
}

resource "google_datastore_index" "videoFrame1" {
  kind = "VideoFrame"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "video_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "videoFrame2" {
  kind = "VideoFrame"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "video_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "frame_number"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.videoFrame1]
}

resource "google_datastore_index" "tracker1" {
  kind = "Tracker"
  properties {
    name = "tracker_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "video_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "trackerClient" {
  kind = "TrackerClient"
  properties {
    name = "tracker_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "video_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "dataset1" {
  kind = "Dataset"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "dataset2" {
  kind = "Dataset"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.dataset1]
}

resource "google_datastore_index" "dataset3" {
  kind = "Dataset"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "delete_in_progress"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.dataset2]
}

resource "google_datastore_index" "datasetRecord1" {
  kind = "DatasetRecord"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "datasetRecord2" {
  kind = "DatasetRecord"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "record_number"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.datasetRecord1]
}

resource "google_datastore_index" "datasetRecordWriter1" {
  kind = "DatasetRecordWriter"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "datasetRecordWriter2" {
  kind = "DatasetRecordWriter"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "record_number"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.datasetRecordWriter1]
}

resource "google_datastore_index" "datasetRecordZipper1" {
  kind = "DatasetZipper"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_zip_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "datasetRecordZipper2" {
  kind = "DatasetZipper"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "dataset_zip_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "partition_index"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.datasetRecordZipper1]
}

resource "google_datastore_index" "model1" {
  kind = "Model"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "model_uuid"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}

resource "google_datastore_index" "model2" {
  kind = "Model"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.model1]
}

resource "google_datastore_index" "model3" {
  kind = "Model"
  properties {
    name = "team_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "delete_in_progress"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_datastore_index.model2]
}

resource "google_datastore_index" "action" {
  kind = "Action"
  properties {
    name = "action_uuid"
    direction = "ASCENDING"
  }
  properties {
    name = "create_time"
    direction = "ASCENDING"
  }
  depends_on = [google_app_engine_application.fmltc-app]
}