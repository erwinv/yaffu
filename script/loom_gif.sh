#!/usr/bin/env bash

ffmpeg \
  -ss ${3:-2} -t ${4:-3} -i "$1" \
  -ignore_loop 0 -i "./play_button.gif" \
  -filter_complex " \
    [0:v] format=yuva420p, fps=12, scale=w=640:h=360:flags=lanczos [v0]; \
    [1:v] format=yuva420p, fps=12, scale=w=-2:h=160:flags=lanczos [playbtn]; \
    [v0][playbtn] overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:shortest=1, split [split0][split1]; \
    [split0] palettegen [palette]; \
    [split1][palette] paletteuse \
  " \
  -loop 0 \
  $2.gif
