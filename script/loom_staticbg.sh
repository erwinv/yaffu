#!/usr/bin/env bash

audiofilters="aresample=48000:async=1, pan=stereo|FL<FL+0.5*FC+0.6*BL+0.6*SL|FR<FR+0.5*FC+0.6*BR+0.6*SR, adelay=0:all=1, asetpts=N/SR/TB"
circlevideofilter="geq=lum='p(X,Y)':a='st(1,pow(min(W/2,H/2),2))+st(3,pow(X-(W/2),2)+pow(Y-(H/2),2));if(lte(ld(3),ld(1)),255,0)'"
circlediameter="300"
circlepadding="40"
outputwidth="1280"
outputheight="720"

ffmpeg \
  -ss 60  -t 10 -i "$1" \
  -i "$2" \
  -filter_complex " \
    [0:v] format=yuva420p, scale=w=-2:h=$outputheight, $circlevideofilter, scale=w=-2:h=$circlediameter, crop=$circlediameter:$circlediameter:'(iw-$circlediameter)/2':0 [circlevid]; \
    [1:v] format=yuv420p, scale=w=$outputwidth:h=$outputheight:force_original_aspect_ratio=increase, crop=$outputwidth:$outputheight [screencap]; \
    [screencap][circlevid] overlay=x=$circlepadding:y='$outputheight-$circlediameter-$circlepadding' [vout]; \
    [0:a] $audiofilters [aout]; \
  " \
  -map "[vout]" -r 30 -c:v libx264 -preset veryfast \
  -map "[aout]" -c:a aac -b:a 128k \
  "$3.mp4"
