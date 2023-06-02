#!/usr/bin/env bash

ffmpeg \
    -i "$1" \
    -vf scale=-1:720 \
    -c:v libx264 "$2"

