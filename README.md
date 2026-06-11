# LabelVault

## Overview

LabelVault is a web-based beverage label intake and registry application designed for distilled spirits labels. Users can upload individual label images or images in bulk and automatically extract key label information while maintaining a searchable registry of approved labels.  Users can also upload spreadsheets with multiple brands and their associated information.  Labels for these brands can be uploaded at a later time.

## Features

### Label Upload
- Upload `.jpg` and `.png` label images
- Drag-and-drop support for quick uploads
- Click-to-upload from a local computer
- Web-based application with no local installation required

### Automated Label Identification
LabelVault analyzes uploaded distilled spirits labels and identifies the following information:

- **Brand Name**
- **Class/Type**
- **Alcohol Content**
- **Net Contents**
- **Government Warning**

### Label Validation Requirements
Uploaded labels should:
- Follow standard TTB (Alcohol and Tobacco Tax and Trade Bureau) label requirements
- Be printable quality labels
- Have a minimum resolution of **300 DPI**

### Duplicate Detection
- Automatically checks uploaded labels against existing records in the database
- Notifies users when a matching label already exists
- Prevents duplicate entries in the registry

### Registry Management
- Save new labels as records when no existing match is found
- Maintain a centralized repository of distilled spirits labels
- Streamline label intake and record management processes
- Delete records if they are no longer needed
- Search and sort by brand name

## How It Works

1. Navigate to the LabelVault application.
2. Upload a `.jpg` or `.png` distilled spirits label using drag-and-drop or file selection.
3. The application analyzes the label and extracts required information.
4. LabelVault checks for matching records in the registry.
5. If a match is found, the user is notified.
6. If no match exists, the user can save the label as a new registry record.

## Accessing the Application

Application URL:
https://label-vault-finder.lovable.app/

## Source Code

GitHub Repository:
https://github.com/ShaunPD/label-vault-finder

## Supported File Types

| File Type | Supported |
|-----------|-----------|
| JPG / JPEG | Yes |
| PNG | Yes |

## Requirements

### End Users
- Modern web browser
- Internet connection
- Access to the LabelVault URL

### Label Images
- Distilled spirits labels
- Minimum 300 DPI resolution
- JPG or PNG format
- Conformance with TTB label requirements

## Use Cases

- Beverage label intake and registration
- Distilled spirits label cataloging
- Duplicate label detection
- Regulatory label review support
- Centralized label record management

## License

Built as a take-home assessment. Not licensed for production use.
