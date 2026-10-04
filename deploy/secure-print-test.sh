#!/usr/bin/env bash
# Tests whether the printer can hold jobs behind a PIN without Canon's UFR II driver,
# which does not exist for 32-bit ARM (e.g. a Raspberry Pi 2 v1.1).
#
#   sudo ./secure-print-test.sh
#
# Run it on the Pi with the printer connected over USB and turned on. It sends a few
# one-page test jobs, each trying a different way to hold the job with PIN 1234, and asks
# what the printer did after each. Paste the summary at the end back into the chat.
#
# It installs cups, cups-ipp-utils and ipp-usb, and creates (then deletes) a temporary
# CUPS queue called printd-test-raw.
set -euo pipefail

PIN=1234
USER_NAME=printdtest
RAW_QUEUE=printd-test-raw
IPP_URI=ipp://localhost:60000/ipp/print
WORK="$(mktemp -d)"
RESULTS="$WORK/results.txt"
trap 'lpadmin -x "$RAW_QUEUE" 2>/dev/null || true' EXIT

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
record() { printf '%s\n' "$*" | tee -a "$RESULTS" >/dev/null; }

[[ $EUID -eq 0 ]] || die "run with sudo"

# Asks what happened with the test job just sent and records the answer.
ask() {
  local name="$1" answer
  cat <<EOF

    Check the printer for the page "printD test: $name".
      1) It printed right away
      2) It was held; releasing it with PIN $PIN printed it
      3) It was held, but PIN $PIN was rejected or it could not be released
      4) Nothing happened (wait a minute first)
      5) An error page or garbage was printed
EOF
  while true; do
    read -rp "    Answer [1-5]: " answer
    case "$answer" in
      1) answer="printed right away" ;;
      2) answer="HELD, released with PIN" ;;
      3) answer="held, PIN rejected" ;;
      4) answer="nothing happened" ;;
      5) answer="error page / garbage" ;;
      *) continue ;;
    esac
    break
  done
  read -rp "    Anything else worth noting (where it showed up on the screen, etc.)? " extra
  record "$name: $answer${extra:+ ($extra)}"
}

# Waits until CUPS has sent everything in the raw queue to the printer.
wait_for_queue() {
  for _ in $(seq 60); do
    [[ -z "$(lpstat -o "$RAW_QUEUE" 2>/dev/null)" ]] && return
    sleep 1
  done
  note "The job is still in the CUPS queue after a minute:"
  lpstat -o "$RAW_QUEUE" || true
}

postscript_page() {
  cat <<EOF
%!PS
/Helvetica findfont 20 scalefont setfont
72 720 moveto (printD test: $1) show
72 690 moveto (PIN $PIN, user $USER_NAME) show
showpage
EOF
}

pcl_page() {
  printf '\033E\033&l26A\033&a5R\033&a10CprintD test: %s\r\n\r\nPIN %s, user %s\f\033E' "$1" "$PIN" "$USER_NAME"
}

# Wraps a page in PJL. With hold=yes, adds the PJL job hold commands HP defined and some
# other vendors adopted.
pjl_job() {
  local name="$1" language="$2" hold="$3"
  printf '\033%%-12345X@PJL\r\n'
  printf '@PJL JOB NAME="%s"\r\n' "$name"
  printf '@PJL SET USERNAME="%s"\r\n' "$USER_NAME"
  printf '@PJL SET JOBNAME="%s"\r\n' "$name"
  if [[ $hold == yes ]]; then
    printf '@PJL SET HOLD=ON\r\n@PJL SET HOLDTYPE=PRIVATE\r\n@PJL SET HOLDKEY="%s"\r\n' "$PIN"
  fi
  printf '@PJL ENTER LANGUAGE=%s\r\n' "$language"
  if [[ $language == POSTSCRIPT ]]; then postscript_page "$name"; else pcl_page "$name"; fi
  printf '\033%%-12345X@PJL EOJ NAME="%s"\r\n\033%%-12345X' "$name"
}

send_raw() {
  local name="$1"
  pjl_job "$@" >"$WORK/job.prn"
  lp -d "$RAW_QUEUE" -t "$name" -o raw "$WORK/job.prn" >/dev/null
  wait_for_queue
  ask "$name"
}

step "Installing what the test needs"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends cups cups-client cups-bsd cups-ipp-utils cups-filters ghostscript curl >/dev/null
systemctl enable --now cups >/dev/null

{
  echo "printD Secure Print test, $(date -Iseconds)"
  echo "Host: $(uname -m), $(. /etc/os-release && echo "$PRETTY_NAME")"
} >"$RESULTS"

step "Part 1: Raw jobs over USB with PJL"
# ipp-usb would claim the USB interface and block the raw queue.
if systemctl list-units --all --plain --no-legend 'ipp-usb*' | grep -q .; then
  systemctl stop 'ipp-usb*' || true
fi
uri="$(lpinfo -v 2>/dev/null | awk '$2 ~ /^usb:\/\/Canon\// {print $2; exit}')"
[[ -n "$uri" ]] || die "no Canon printer found on USB. Check the cable and that it is turned on (lpinfo -v lists devices)."
note "Printer: $uri"
record "USB URI: $uri"
record "Device ID: $(lpinfo -l -v 2>/dev/null | awk -v u="$uri" 'index($0, "uri = " u) {f=1} f && /device-id/ {sub(/.*device-id = /, ""); print; exit}')"
# CUPS 2.4 warns that raw queues are deprecated; they still work.
lpadmin -p "$RAW_QUEUE" -E -v "$uri" -m raw 2>/dev/null

note "Test 1: PostScript, no hold. Checks that the printer understands PostScript at all."
send_raw "1 PostScript plain" POSTSCRIPT no
note "Test 2: PostScript with a PJL hold and PIN."
send_raw "2 PostScript PJL hold" POSTSCRIPT yes
note "Test 3: PCL, no hold. Checks that the printer understands PCL at all."
send_raw "3 PCL plain" PCL no
note "Test 4: PCL with a PJL hold and PIN."
send_raw "4 PCL PJL hold" PCL yes
lpadmin -x "$RAW_QUEUE"

step "Part 2: IPP over USB"
if [[ -f /etc/apt/preferences.d/no-ipp-usb ]]; then
  note "Removing the apt pin that blocks ipp-usb (from printD's setup.sh)."
  rm /etc/apt/preferences.d/no-ipp-usb
fi
apt-get install -y -qq ipp-usb >/dev/null
systemctl restart 'ipp-usb*' 2>/dev/null || true

reachable() { ipptool -q "$IPP_URI" get-printer-attributes.test 2>/dev/null; }
for _ in $(seq 15); do reachable && break; sleep 2; done
if ! reachable; then
  read -rp "    The printer is not reachable over IPP yet. Unplug the USB cable, plug it back in, then press Enter. "
  for _ in $(seq 20); do reachable && break; sleep 2; done
fi

if ! reachable; then
  record "IPP over USB: not reachable at $IPP_URI"
else
  ipptool -tv "$IPP_URI" get-printer-attributes.test >"$WORK/attrs.txt" 2>&1 || true
  attr() { sed -n "s/^ *$1 ([^)]*) = //p" "$WORK/attrs.txt" | head -1; }
  for a in printer-make-and-model document-format-supported job-password-supported \
    job-password-encryption-supported job-password-length-supported job-creation-attributes-supported \
    job-hold-until-supported; do
    record "IPP $a: $(attr "$a")"
  done

  password_len="$(attr job-password-supported)"
  encryptions="$(attr job-password-encryption-supported)"
  if [[ -z "$password_len" || "$password_len" == 0 ]]; then
    note "The printer does not advertise job-password, skipping the IPP PIN test."
  elif [[ "$(attr document-format-supported)" != *application/pdf* ]]; then
    note "The printer does not accept PDF over IPP, skipping the IPP PIN test."
  else
    # The PIN is sent hashed with the strongest method the printer offers, or as is.
    case ",$encryptions," in
      *,none,*) enc=none; hex="$(printf '%s' "$PIN" | od -An -tx1 | tr -d ' \n')" ;;
      *,sha2-256,*) enc=sha2-256; hex="$(printf '%s' "$PIN" | sha256sum | cut -d' ' -f1)" ;;
      *,sha,*) enc=sha; hex="$(printf '%s' "$PIN" | sha1sum | cut -d' ' -f1)" ;;
      *,md5,*) enc=md5; hex="$(printf '%s' "$PIN" | md5sum | cut -d' ' -f1)" ;;
      *) enc="" ;;
    esac
    if [[ -z "$enc" ]]; then
      note "No usable job-password-encryption ($encryptions), skipping the IPP PIN test."
    else
      name="5 IPP job-password"
      postscript_page "$name" >"$WORK/page.ps"
      ps2pdf "$WORK/page.ps" "$WORK/page.pdf"
      cat >"$WORK/print.test" <<EOF
{
  NAME "$name"
  OPERATION Print-Job
  GROUP operation-attributes-tag
  ATTR charset attributes-charset utf-8
  ATTR naturalLanguage attributes-natural-language en
  ATTR uri printer-uri \$uri
  ATTR name requesting-user-name $USER_NAME
  ATTR name job-name "printD test: $name"
  ATTR mimeMediaType document-format application/pdf
  ATTR octetString job-password <$hex>
  ATTR keyword job-password-encryption $enc
  FILE \$filename
  STATUS successful-ok
}
EOF
      note "Test 5: PDF over IPP with job-password ($enc)."
      if ipptool -tv -f "$WORK/page.pdf" "$IPP_URI" "$WORK/print.test" >"$WORK/print.log" 2>&1; then
        ask "$name"
      else
        record "$name: rejected by the printer: $(grep -m1 -E 'status-code|EXPECTED|GOT' "$WORK/print.log" | sed 's/^ *//')"
      fi
    fi
  fi
fi

read -rp $'\n    Remove ipp-usb again? It blocks Canon\'s driver and raw USB printing. [Y/n] ' remove
if [[ "${remove:-y}" =~ ^[Yy] ]]; then
  apt-get purge -y -qq ipp-usb >/dev/null
  note "Removed. Unplug and replug the USB cable before printing over raw USB again."
fi

cp "$RESULTS" ./printd-secure-print-test.txt 2>/dev/null || true
step "Summary (also saved to printd-secure-print-test.txt), paste this into the chat"
cat "$RESULTS"
