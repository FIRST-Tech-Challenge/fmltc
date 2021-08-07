# Overview

This directory contains a [Terraform](https://www.terraform.io/) description of the Google Cloud resources necessary to install the FIRST Machine Learning Toolchain software.

## Prerequisites

- Familiarity navigating a filesystem and executing commands using a bash shell.  On Windows systems the shell packaged with [Git for Windows](https://gitforwindows.org/) is recommended.
- Familiarity with git

## Requirements
- A new Google Cloud project with billing enabled. [Instructions](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
- A Terraform Installation. [Instructions](https://learn.hashicorp.com/tutorials/terraform/install-cli?in=terraform/gcp-get-started)
- Gradle. [Instructions](https://gradle.org/install/)
- A service key for the Google Cloud project (Granted Owner role).

## General Guidelines

For the Google Cloud project name you should choose a unique name that ensures that the project name and project id are the same.  Project ids are globally unique, so if you choose a project name that is already taken, Google will append a random number to your project id.  It's less confusing all around if your project id does not have that random number hanging off the end.

Best practices for project naming
- If you are associated with a FIRST team prepend the project name with your program and team number.  e.g.  ftc25-* or frc5218-*
- Ensure it is globally unique so that the project name and id are identical
- Don't use generic project names that might be globally useful in other contexts.  e.g. first-machine-learning-* or similar.

The end result of following these instructions is a publicly available App Engine server.  If your Google account's free tier has expired, Google will begin charging your credit card for costs associated with the account.  Users should monitor their costs closely to avoid unexpected bills. 

## Installation Instructions

1. Install Terraform.
1. Install Gradle.
1. From the Google Cloud console:
    1. Create a new Google Cloud project following naming guidelines above. [Instructions](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
    1. Enable billing on the new project. [Instructions](https://cloud.google.com/billing/docs/how-to/modify-project#confirm_billing_is_enabled_on_a_project)
    1. Create/Download a service key file granted the Owner role.  You want a JSON key, and you must assign it the Owner role.  [Instructions](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#creating_service_account_keys)
1. Copy the downloaded service key credentials file to the fmltc server directory and name it key.json.
1. From a bash shell in the root of the project run: 
    >gradle compileJavascript.
1. Create a file named 'teams' in fmltc's root directory that has one line.  
    >FTC, \<your team number>, \<password>
        
    Note that you should be careful to not upload this file to public repositories and you should choose a password that is not easily guessed.
1. Navigate to terraform/dev.
1. Edit terraform.tfvars to reflect your, project_name and project_id. 
1. Run: 
     >terraform apply<br>
     >terraform init

You should now have a completely provisioned Google Cloud project for the fmltc tool.

## Connecting To The Server

The installation above should create an App Engine server that you can find on the App Engine Dashboard on the Google Cloud console.  Log in using the program type, team number, and password you put in the 'teams' file.
