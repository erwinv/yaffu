#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=1280:720:force_original_aspect_ratio=increase, crop=1280:720 [cam0]; \
		[cam0] pad=1280:720:-1:-1 [out] \
	" \
	-map "[out]" -r 30 -c:v libx264 -preset veryfast "$4_1.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam0]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam1]; \
		\
		[cam0][cam1] xstack=inputs=2:fill=black:layout=0_0|w0_0, pad=1280:720:-1:-1 [out] \
	" \
	-map "[out]" -r 30 -c:v libx264 -preset veryfast "$4_2.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam0]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam1]; \
		[cam0][cam1] xstack=inputs=2:fill=black:layout=0_0|w0_0 [grid]; \
		\
		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam2]; \
		[cam2] pad=1280:ih:-1:-1 [botrow]; \
		\
		[grid][botrow] vstack=inputs=2 [out] \
	" \
	-map "[out]" -r 30 -c:v libx264 -preset veryfast "$4_3.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam0]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360, split [cam1][cam3]; \
		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=640:360:force_original_aspect_ratio=increase, crop=640:360 [cam2]; \
		\
		[cam0][cam1][cam2][cam3] xstack=inputs=4:fill=black:layout=0_0|w0_0|0_h0|w0_h0 [out] \
	" \
	-map "[out]" -r 30 -c:v libx264 -preset veryfast "$4_4.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam0]; \
		\
		[cam0] pad=iw:720:-1:-1 [campanel]; \
		[main][campanel] hstack [out] \
	" \
	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_1.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam0]; \
		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam1]; \
		\
		[cam0][cam1] vstack=inputs=2, pad=iw:720:-1:-1 [campanel]; \
		[main][campanel] hstack [out] \
	" \
	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_2.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180, split [cam0][cam2]; \
		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam1]; \
		\
		[cam0][cam1][cam2] vstack=inputs=3, pad=iw:720:-1:-1 [campanel]; \
		[main][campanel] hstack [out] \
	" \
	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_3.mp4"

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180, split [cam0][cam2]; \
		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180, split [cam1][cam3]; \
		\
		[cam0][cam1][cam2][cam3] vstack=inputs=4, pad=iw:720:-1:-1 [campanel]; \
		[main][campanel] hstack [out] \
	" \
	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_4.mp4"

#ffmpeg \
#	-i "$1" \
#	-i "$2" \
#	-filter_complex " \
#		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
#		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam0]; \
#		\
#		[main][cam0] xstack=fill=black:layout=0_0|w0_0 [out] \
#	" \
#	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_1_topalign.mp4"
#
#ffmpeg \
#	-i "$1" \
#	-i "$2" \
#	-i "$3" \
#	-filter_complex " \
#		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
#		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam0]; \
#		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam1]; \
#		\
#		[main][cam0][cam1] xstack=inputs=3:fill=black:layout=0_0|w0_0|w0_h1 [out] \
#	" \
#	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_2_topalign.mp4"
#
#ffmpeg \
#	-i "$1" \
#	-i "$2" \
#	-i "$3" \
#	-filter_complex " \
#		[0:v] setpts=PTS-STARTPTS, format=yuv420p, scale=960:720:force_original_aspect_ratio=decrease, pad=960:720:-1:-1 [main]; \
#		[1:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180, split [cam0][cam2]; \
#		[2:v] setpts=PTS-STARTPTS, format=yuv420p, scale=320:180:force_original_aspect_ratio=increase, crop=320:180 [cam1]; \
#		\
#		[main][cam0][cam1][cam2] xstack=inputs=4:fill=black:layout=0_0|w0_0|w0_h1|w0_h1+h2 [out] \
#	" \
#	-map "[out]" -r 24 -c:v libx264 -preset veryfast "$4_1_3_topalign.mp4"
