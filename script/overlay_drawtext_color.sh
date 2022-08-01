#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] trim=start=4:end=6, setpts=PTS-STARTPTS, \
			format=yuv420p, scale=1280:720:force_original_aspect_ratio=increase, crop=1280:720, \
			tpad=start_duration=2 [cam0]; \
		[1:v] trim=start=4:end=6, setpts=PTS-STARTPTS, \
			format=yuv420p, scale=1280:720:force_original_aspect_ratio=increase, crop=1280:720, \
			tpad=start_duration=6 [cam1]; \
		[2:v] trim=start=4:end=6, setpts=PTS-STARTPTS, \
			format=yuv420p, scale=1280:720:force_original_aspect_ratio=increase, crop=1280:720, \
			tpad=start_duration=10 [cam2]; \
		\
		color=size=1264x712:color=0x63666A:duration=14, \
		drawtext=text='Big Buck Bunny':x=(w-text_w)/2:y=(h-text_h)/2:fontcolor=0xF2E9EA:fontsize=60, pad=1280:720:-1:-1:black [thumb]; \
		\
		[thumb][cam0] overlay=enable='gte(t,2)':eof_action=pass [ovl0]; \
		[ovl0][cam1] overlay=enable='gte(t,6)':eof_action=pass [ovl1]; \
		[ovl1][cam2] overlay=enable='gte(t,10)':eof_action=pass [out] \
	" \
	-map "[out]" -r 30 -c:v libx264 -preset veryfast "$4.mp4"
