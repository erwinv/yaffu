#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-filter_complex " \
		[0:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, adelay=0:all=1, asetpts=N/SR/TB [mic0]; \
		[1:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, adelay=1000:all=1, asetpts=N/SR/TB [mic1]; \
		[2:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, adelay=2000:all=1, asetpts=N/SR/TB [mic2]; \
		\
		[mic0][mic1][mic2] amix=inputs=3:normalize=0,dynaudnorm,asplit [out1][out2] \
	" \
	-map "[out1]" -c:a aac -b:a 128k "$4.aac" \
	-map "[out2]" -c:a libopus -b:a 128k "$4.opus"
