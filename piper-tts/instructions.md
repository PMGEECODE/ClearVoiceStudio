Yes. If you're on Linux, Piper is quite straightforward to install, and the current maintained project is OHF-Voice/piper1-gpl, installed from PyPI as piper-tts.

1. Create a virtual environment

I recommend keeping Piper isolated:

mkdir -p ~/piper-tts
cd ~/piper-tts

python3 -m venv .venv
source .venv/bin/activate

Then:

pip install --upgrade pip
pip install piper-tts

The official CLI documentation uses exactly pip install piper-tts.

2. Download a voice

For example, download an English voice:

python3 -m piper.download_voices en_US-lessac-medium

Piper will download the voice model into your current directory.

You can see available voices with:

python3 -m piper.download_voices
3. Convert text to WAV

Now:

python3 -m piper \
  -m en_US-lessac-medium \
  -f output.wav \
  -- "Hello, welcome to our application."

You'll get:

output.wav

You can play it with:

ffplay output.wav

or:

aplay output.wav

The official CLI supports writing directly to a WAV file with -f.

Even easier: text file → audio

If you have:

script.txt

containing:

Welcome to our school management system.

Your payment has been received successfully.

Thank you for using our service.

Run:

python3 -m piper \
  -m en_US-lessac-medium \
  -f speech.wav \
  < script.txt
If you want it to speak immediately

With ffplay installed:

python3 -m piper \
  -m en_US-lessac-medium \
  -- "Hello George, this is Piper speaking."

Piper can send the synthesized audio directly for playback when ffplay is available.

Install FFmpeg if needed:

sudo apt update
sudo apt install ffmpeg
If you're building an application

This is where Piper becomes more interesting.

Instead of starting Piper every time you need speech, you can run its HTTP server and send text to it. The official Piper HTTP interface runs on port 5000 by default.

Install the HTTP component:

pip install "piper-tts[http]"

Then:

python3 -m piper.http_server \
  -m en_US-lessac-medium

Now you can send:

curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, this is Piper."}' \
  -o output.wav \
  http://localhost:5000/synthesize

That gives you:

output.wav

You can also check:

curl http://localhost:5000/info

and:

curl http://localhost:5000/voices

The HTTP server is preferable for repeated synthesis because the CLI has to load the model each time.

One important thing

If your goal is something like FastAPI + Piper, offline TTS, generating lots of audio files, or real-time speech, I'd set it up differently from the basic CLI. Piper can run entirely locally, and you can keep the voice model loaded in memory rather than launching a new process for every sentence.
