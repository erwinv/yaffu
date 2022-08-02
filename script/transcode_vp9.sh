#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-b:v 1800k -minrate 900k -maxrate 2610k \
	-tile-columns 2 -g 240 -threads 8 -quality good -crf 31 -speed 2 -row-mt 1 \
	-c:v libvpx-vp9 "$2"

