import re
import sys

from jupyter_core.command import main as jupyter_main


def main():
    sys.argv[0] = re.sub(r"(-script\.pyw|\.exe)?$", "", sys.argv[0])
    if len(sys.argv) > 1 and sys.argv[1] == "lab":
        from jupyterlab.labapp import main as lab_main

        # Remove 'lab' from sys.argv
        sys.argv.pop(1)

        # Optionally, ensure sys.argv is exactly what it needs to be for lab_main
        sys.argv = [sys.argv[0]] + sys.argv[1:]

        lab_main()
        # Add more custom commands or overrides here

    # Default to standard Jupyter command handling
    sys.exit(jupyter_main())


if __name__ == "__main__":
    main()
