#!/usr/bin/env bash

ffmpeg \
  -ss ${4:0} -t ${3:-10} -i "$1"\
  -filter_complex " \
  [0:v]fps=12,scale=480:-1,split[s0][s1]; \
  [s0]palettegen=stats_mode=single[p]; \
  [s1][p]paletteuse=new=1[v] \
  " \
  -map "[v]" \
  -loop 0 \
  $2.gif
