# AI device settings

Open **Settings → Hardware → AI inference devices** and click **Apply AI device settings** after choosing a mode:

- **Automatic:** keep the runtime's existing device defaults.
- **Use selected GPUs:** check one or several cards. There is no limit on the number of selected cards.
- **Use all detected GPUs:** permit all detected cards, including cards added later. The **Select all cards** button chooses this mode.
- **CPU only:** disable GPU inference.

The choice applies to new local llama.cpp and Ollama launches. Restart Core to ensure existing sessions use the new settings. Remote inference services retain their own hardware configuration. Desktop graphics remains under operating-system control.

NVIDIA selections are saved by GPU UUID, rather than device number. A missing selected card produces an error instead of using another card. Other backends are discovered through the installed llama.cpp `--list-devices` interface; ambiguous device identities cannot be selected individually. All detected and Automatic remain available. Devices must be supported by the installed inference backend. Selecting multiple cards permits multi-GPU inference; it does not guarantee equal utilization or faster generation. llama.cpp uses layer splitting for multiple selected devices. Ollama chooses model placement within its permitted devices.

For a Quadro M5000 used for desktop graphics and a Tesla P4 used for inference, select **Use selected GPUs**, check only **Tesla P4**, and apply. To use two inference cards, check both, or choose **Use all detected GPUs**.

## CUDA compilation targets

This separate setting controls future llama.cpp builds through the existing Binary Manager and Catalog Editor **Update conversion tools** action. Applying device settings does not start a build or change a running build.

- **All detected GPU architectures** builds for every detected NVIDIA compute capability.
- **Selected AI device architectures** builds for the selected NVIDIA cards. For a P4-only selection, the target is `61`; including an M5000 adds `52`. Fewer targets can reduce compilation time.
- **Custom CUDA architectures** accepts semicolon-separated CMake targets, such as `86;89`. Use this for advanced builds or hardware not currently attached. The installed CUDA toolkit must support those targets.

Selecting CPU only with selected-device build targets creates a CPU build. Changing cards may require a new explicit tool build if the current binary lacks support for their architecture. GPU selection does not silently update or rebuild tools.

First tool builds can take tens of minutes or longer, depending on CPU speed, compilation targets, available memory, and dependency downloads. Tool updates run in a background worker and display elapsed time. Conversion and quantization also take time independently of compilation; source conversion generally runs on the CPU.

Runtime references: [llama.cpp multi-GPU documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/multi-gpu.md), [Ollama GPU selection](https://docs.ollama.com/gpu).
