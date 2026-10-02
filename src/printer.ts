import { type DeviceModel, deviceScreens, type PutOptions } from "rmapi-js";
import { defaultOptions, getOptions } from "./options";
import { measureMargins } from "./render";
import { uploadPdf } from "./upload";

const PRINTER_ID = "repub-pdf";

const MICRONS_PER_INCH = 25_400;

// one per distinct screen; the remaining models repeat a size already here
const paperModels: DeviceModel[] = ["RM110", "RM02A", "RM03A"];

function papers(device: DeviceModel) {
  const selected = paperModels.includes(device)
    ? device
    : defaultOptions.device;
  return paperModels.map((model) => {
    const { name, width, height, dpi } = deviceScreens[model];
    return {
      name: "CUSTOM",
      vendor_id: model,
      custom_display_name: name,
      width_microns: Math.round((width / dpi) * MICRONS_PER_INCH),
      height_microns: Math.round((height / dpi) * MICRONS_PER_INCH),
      is_default: model === selected,
    };
  });
}

/**
 * the epub margin as a printed margin
 *
 * @remarks The tablet's margin setting is in screen pixels: a document saved at
 * 125 renders its text 14mm in on a reMarkable 2, and one at 225 renders it
 * 25mm in, both measured off the tablet's own render.
 */
function margin(device: DeviceModel, margins: number): number {
  return Math.round((margins / deviceScreens[device].dpi) * MICRONS_PER_INCH);
}

/**
 * what chrome's print dialog is told this printer can do
 *
 * The papers are the reMarkable screens, so a printed page fills the tablet
 * instead of arriving letterboxed. The print dialog only offers its own four
 * margin choices, so the epub margin becomes the default one and the rest are
 * the dialog's to give.
 */
function capabilities(
  device: DeviceModel,
  margins: number,
): chrome.printerProvider.PrinterCapabilities {
  const edge = margin(device, margins);
  const description = {
    version: "1",
    printer: {
      supported_content_type: [{ content_type: "application/pdf" }],
      color: {
        option: [
          { type: "STANDARD_COLOR", is_default: true },
          { type: "STANDARD_MONOCHROME" },
        ],
      },
      media_size: { option: papers(device) },
      margins: {
        option: [
          {
            type: "STANDARD",
            top_microns: edge,
            bottom_microns: edge,
            left_microns: edge,
            right_microns: edge,
            is_default: true,
          },
          {
            type: "BORDERLESS",
            top_microns: 0,
            bottom_microns: 0,
            left_microns: 0,
            right_microns: 0,
          },
        ],
      },
    },
  };
  // chrome wants the description itself; the typings wrap it in a key it never
  // reads
  return description as unknown as chrome.printerProvider.PrinterCapabilities;
}

async function printToRemarkable({
  title,
  document,
}: chrome.printerProvider.PrintJob): Promise<void> {
  const opts = await getOptions();
  if (!opts.deviceToken) {
    throw new Error("must be authenticated to upload documents to reMarkable");
  }
  const pdf = new Uint8Array(await document.arrayBuffer());
  let zoom: Partial<PutOptions> = {};
  if (opts.trimPdf) {
    try {
      zoom = await measureMargins(pdf, opts.device);
    } catch (ex) {
      console.error("failed to analyze pdf margins", ex);
    }
  }
  await uploadPdf(pdf, title || "missing title", opts.deviceToken, opts, zoom);
}

/**
 * offer this extension as a printer, so any page can be printed to reMarkable
 *
 * Chrome hands us the rendered pdf, which we upload like any other. The printer
 * stays hidden until the extension is connected, since there's nowhere to send
 * to before then.
 */
export function registerPrinter(): void {
  chrome.printerProvider.onGetPrintersRequested.addListener((respond) => {
    getOptions().then(
      ({ deviceToken }) => {
        respond(
          deviceToken
            ? [
                {
                  id: PRINTER_ID,
                  name: "rePub",
                  description:
                    "Save this page as a PDF and upload it to your reMarkable.",
                },
              ]
            : [],
        );
      },
      (ex: unknown) => {
        console.error("couldn't read options to list the printer", ex);
        respond([]);
      },
    );
  });

  const fallback = capabilities(defaultOptions.device, defaultOptions.margins);
  chrome.printerProvider.onGetCapabilityRequested.addListener(
    (printerId, respond) => {
      if (printerId !== PRINTER_ID) {
        respond(fallback);
      } else {
        getOptions().then(
          ({ device, margins }) => {
            respond(capabilities(device, margins));
          },
          (ex: unknown) => {
            console.error("couldn't read options for the printer papers", ex);
            respond(fallback);
          },
        );
      }
    },
  );

  chrome.printerProvider.onPrintRequested.addListener((job, respond) => {
    if (job.printerId !== PRINTER_ID) {
      respond("FAILED");
    } else {
      printToRemarkable(job).then(
        () => {
          respond("OK");
        },
        (ex: unknown) => {
          console.error("printing to reMarkable failed", ex);
          respond("FAILED");
        },
      );
    }
  });
}
