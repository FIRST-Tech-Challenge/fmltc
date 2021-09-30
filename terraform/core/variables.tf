#
# These variables are specific to an individual deployment
# Define values for them in terraform.tfvars
#
# The credential must have owner permission (editor is not sufficient).
#
variable "credentials_file"  { type = string }
variable "region"            { type = string }
variable "app_engine_region" { type = string }
variable "zone"              { type = string }

#
# The following variables must be set in the environment
#
variable "project_id"        { type = string }
variable "project_url"    { type = string }
