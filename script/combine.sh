#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-i "$2" \
	-c:a copy -c:v copy \
	"$3"
