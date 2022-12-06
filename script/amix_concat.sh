#!/usr/bin/env bash

ffmpeg \
	-i "$1" \
	-i "$2" \
	-i "$3" \
	-i "$4" \
	-i "$5" \
	-i "$6" \
	-i "$7" \
	-i "$8" \
	-i "$9" \
	-filter_complex " \
		[0:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a0]; \
		[1:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a1]; \
		[2:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a2]; \
		[3:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a3]; \
		[4:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a4]; \
		[5:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a5]; \
		[6:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a6]; \
		[7:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a7]; \
		[8:a] aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, asetpts=N/SR/TB [a8]; \
		\
		[a0][a1][a2] amix=inputs=3:normalize=0, dynaudnorm [mix1]; \
		[a3][a4][a5] amix=inputs=3:normalize=0, dynaudnorm [mix2]; \
		[a6][a7][a8] amix=inputs=3:normalize=0, dynaudnorm [mix3]; \
		\
		[mix1][mix2][mix3] concat=n=3:v=0:a=1 [concatout] \
	" \
	-map "[concatout]" -c:a libopus -b:a 128k "${10}.opus"
