import styled from "@emotion/styled";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import Alert, { type AlertColor } from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Input from "@mui/material/Input";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import OutlinedInput from "@mui/material/OutlinedInput";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { marked } from "marked";
import {
  type ChangeEvent,
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import {
  FaA,
  FaAlignJustify,
  FaAlignLeft,
  FaBan,
  FaBars,
  FaCheck,
  FaEquals,
  FaLock,
  FaQuestion,
  FaRegFile,
  FaRegFileImage,
  FaRegFileLines,
  FaRegImage,
  FaRegImages,
  FaRegRectangleXmark,
  FaRegSquare,
  FaTableCells,
  FaTableCellsLarge,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6";
import { type DeviceModel, type PutOptions, register } from "rmapi-js";
import repubPlain from "../public/repub-plain.svg";
import { toMhtml } from "../src/mhtml";
import {
  defaultOptions,
  getOptions,
  type Options,
  type OutputStyle,
  type SetOptions,
  setOptions,
} from "../src/options";
import { analyzePdfMargins } from "../src/pdf-trim";
import { render } from "../src/render";
import { uploadEpub, uploadPdf } from "../src/upload";
import { sleep } from "../src/utils";
import ButtonSelection from "./button-selection";
import CheckboxSelection from "./checkbox-selection";
import FormControlLabel from "./form-control-label";
import LeftRight from "./left-right";
import RadioSelection from "./radio-selection";
import Right from "./right";
import Section from "./section";

const theme = createTheme({
  palette: {
    primary: {
      main: "#000",
    },
  },
  shape: {
    borderRadius: 0,
  },
});

const unknownOpts: Partial<Options> = Object.fromEntries(
  Object.entries(defaultOptions).map(([key]) => [key, undefined]),
);

async function getToken(code: string, authHost: string): Promise<string> {
  // This is for testing in dev mode
  if (window.chrome?.runtime?.id) {
    return await register(code, { authHost });
  } else {
    await sleep(1000);
    return "fake token";
  }
}

function OutputStylePicker({
  outputStyle,
  setOpts,
}: {
  outputStyle: OutputStyle | undefined;
  setOpts: SetOptions;
}): ReactElement {
  const onChange = useCallback(
    (val: OutputStyle) => {
      setOpts({ outputStyle: val });
    },
    [setOpts],
  );

  return (
    <RadioSelection
      value={outputStyle}
      onChange={onChange}
      selections={[
        {
          val: "download",
          title: "Download article as file",
          caption: `With this selected, the article will be converted into an
          epub file and then downloaded. This doesn't required connecting this
          extension to reMarkable, but doesn't allow tweaking reMarkable
          specific upload settings.`,
        },
        {
          val: "upload",
          title: "Upload article to reMarkable",
          caption: `With this selected, the article will be uploaded to your
          reMarkable cloud. This allows tweaking reMarkable upload settings,
          but requires connecting the extension to your reMarkable account.`,
        },
      ]}
    />
  );
}

async function uploadFile(deviceToken: string, file: File): Promise<void> {
  // strip extension up to 4 characters
  const file_title = file.name.replace(/\.[^/.]{0,4}$/, "");
  const [buff, opts] = await Promise.all([file.arrayBuffer(), getOptions()]);
  if (file.type === "application/epub+zip") {
    await uploadEpub(new Uint8Array(buff), file_title, deviceToken, opts);
  } else if (file.type === "application/pdf") {
    const pdf = new Uint8Array(buff);
    let zoom: Partial<PutOptions> = {};
    if (opts.pdfTrimDevice) {
      try {
        zoom = await analyzePdfMargins(pdf, opts.pdfTrimDevice);
      } catch (ex) {
        console.error("failed to analyze pdf margins", ex);
      }
    }
    await uploadPdf(pdf, file_title, deviceToken, opts, zoom);
  } else if (file.type === "multipart/related") {
    const { epub, title = file_title } = await render(buff, opts);
    await uploadEpub(epub, title, deviceToken, opts);
  } else if (file.type === "text/markdown") {
    // convert markdown to html and extract image URLs
    const dec = new TextDecoder();
    const images: string[] = [];
    const html = marked.parse(dec.decode(new Uint8Array(buff)), {
      gfm: true,
      walkTokens: (token) => {
        if (token.type === "image") {
          images.push(token.href as string);
        }
      },
    }) as string;
    // convert html and images into mhtml to utilize the same rendering code
    const mhtml = await toMhtml(file.name, html, images);
    const { epub, title = file_title } = await render(
      mhtml.buffer as ArrayBuffer,
      opts,
      file_title,
      undefined,
      false,
    );
    await uploadEpub(epub, title, deviceToken, opts);
  } else {
    throw new Error(`unknown file type: ${file.type}`);
  }
}

// the page-level dropzone (in OptionsPage) opens the file dialog and tracks the
// in-flight upload; the button just triggers and reflects them
const UploadControl = createContext<{ open: () => void; uploading: boolean }>({
  open: () => {},
  uploading: false,
});

function FileUpload(): ReactElement {
  const { open, uploading } = useContext(UploadControl);
  return (
    <Button
      variant="outlined"
      fullWidth
      onClick={open}
      loading={uploading}
      loadingPosition="end"
    >
      Upload to reMarkable
    </Button>
  );
}

// muted brick red, toned down to sit with the page's sepia rather than a stark
// signal red
const DROP_REJECT_COLOR = "#a15749";

function DropOverlay({ reject }: { reject: boolean }): ReactElement {
  const accent = reject ? DROP_REJECT_COLOR : "#000";
  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: accent,
        bgcolor: "rgba(250, 246, 240, 0.94)",
        border: "1px dashed",
        borderColor: accent,
      }}
    >
      <Stack spacing={2} sx={{ alignItems: "center" }}>
        {reject ? <FaBan size={36} /> : <FaRegFile size={36} />}
        <Typography variant="h5">
          {reject ? "Unsupported file type" : "Drop to upload to reMarkable"}
        </Typography>
      </Stack>
    </Box>
  );
}

function SignIn({
  deviceToken,
  outputStyle,
  setOpts,
  showSnack,
  authHost,
  tokenUrl,
}: {
  deviceToken?: string;
  outputStyle?: OutputStyle;
  setOpts: SetOptions;
  showSnack: (snk: Snack) => void;
  authHost: string;
  tokenUrl: string;
}): ReactElement | null {
  const [incCode, setIncCode] = useState("");
  const [registering, setRegistering] = useState(false);

  const changeAuth = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      (async () => {
        const val = evt.target.value;
        setIncCode(val);
        if (val.length !== 8) return;
        setRegistering(true);
        const deviceToken = await getToken(val, authHost);
        setOpts({ deviceToken });
        showSnack({
          key: "login",
          severity: "success",
          message: "linked reMarkable account successfully",
        });
      })()
        .catch((err) => {
          console.error(err);
          showSnack({
            key: "login error",
            severity: "error",
            message: "problem trying to link reMarkable account",
          });
        })
        .finally(() => {
          setIncCode("");
          setRegistering(false);
        });
    },
    [setOpts, showSnack, authHost],
  );
  const clipboard = useCallback(() => {
    (async () => {
      setRegistering(true);
      const content = await navigator.clipboard.readText();
      if (content.length !== 8) return;
      setIncCode(content);
      const deviceToken = await getToken(content, authHost);
      setOpts({ deviceToken });
      showSnack({
        key: "login",
        severity: "success",
        message: "linked reMarkable account successfully",
      });
    })()
      .catch((err) => {
        console.error(err);
        showSnack({
          key: "login error",
          severity: "error",
          message: "problem trying to link reMarkable account",
        });
      })
      .finally(() => {
        setIncCode("");
        setRegistering(false);
      });
  }, [setOpts, showSnack, authHost]);

  if (deviceToken) {
    return (
      <Right>
        <Stack spacing={1}>
          <FileUpload />
        </Stack>
      </Right>
    );
  } else if (outputStyle === "download" || outputStyle === undefined) {
    return null;
  } else {
    const pasteAdornment = (
      <InputAdornment position="end">
        <Tooltip title="paste code from clipboard">
          <IconButton
            aria-label="paste into input field"
            onClick={clipboard}
            edge="end"
            disabled={registering}
          >
            {registering ? (
              <CircularProgress size={16} />
            ) : (
              <ContentPasteIcon />
            )}
          </IconButton>
        </Tooltip>
      </InputAdornment>
    );

    return (
      <Right>
        <Stack spacing={1}>
          <Alert severity="warning">
            If choosing to upload documents, you must link this extension to
            your reMarkable account
          </Alert>
          <Link href={tokenUrl} target="_blank">
            <Button variant="contained" fullWidth={true}>
              Get one-time code
            </Button>
          </Link>
          <Typography>
            Click the button above to copy an eight-letter one time code
            authorizing connection to your reMarkable account, then paste it
            below, or click the clipboard paste icon.
          </Typography>
          <OutlinedInput
            value={incCode}
            disabled={registering}
            onChange={changeAuth}
            endAdornment={pasteAdornment}
            fullWidth={true}
          />
        </Stack>
      </Right>
    );
  }
}

type BooleanKeys = {
  [K in keyof Options]: Options[K] extends boolean ? K : never;
}[keyof Options];

function SimplCheckboxSelection({
  name,
  title,
  caption,
  opts,
  setOpts,
  disabled,
  onChange,
}: {
  name: BooleanKeys;
  title: string;
  caption: string;
  opts: Partial<Options>;
  setOpts: SetOptions;
  disabled?: boolean;
  onChange?: (val: boolean) => void;
}): ReactElement {
  const val = opts[name];
  const onToggle = useCallback(() => {
    const newVal = !val;
    setOpts({ [name]: newVal });
    if (onChange) {
      onChange(newVal);
    }
  }, [setOpts, val, onChange, name]);
  return (
    <CheckboxSelection
      value={val}
      onToggle={onToggle}
      title={title}
      caption={caption}
      disabled={disabled}
    />
  );
}

function CloseImages({
  imageHrefSimilarityThreshold,
  setOpts,
}: {
  imageHrefSimilarityThreshold: number | undefined;
  setOpts: SetOptions;
}): ReactElement {
  const onToggle = useCallback(() => {
    setOpts({
      imageHrefSimilarityThreshold:
        imageHrefSimilarityThreshold === 0
          ? defaultOptions.imageHrefSimilarityThreshold
          : 0,
    });
  }, [setOpts, imageHrefSimilarityThreshold]);
  return (
    <CheckboxSelection
      value={imageHrefSimilarityThreshold !== 0}
      onToggle={onToggle}
      title="Match Close Images"
      caption={`Due to a bug in chrome, and potentially other factors,
      capturing the page may get a different image than the ones that appear in
      the captured html. Selecting this causes the extension to do a more
      expensive search for close image urls it has, and uses those images
      instead. If images you expect to be present are missing, this may help,
      if images seem out of context, consider disabling this.`}
    />
  );
}

function ImageBrightness({
  imageBrightness,
  setOpts,
}: {
  imageBrightness: number | undefined;
  setOpts: SetOptions;
}): ReactElement {
  const onToggle = useCallback(() => {
    setOpts({
      imageBrightness: imageBrightness === 1 ? 1.2 : 1,
    });
  }, [setOpts, imageBrightness]);
  return (
    <CheckboxSelection
      value={imageBrightness !== 1}
      onToggle={onToggle}
      title="Brighten Images"
      caption={`Due to the fact that reMarkable isn't pure white, images can
      appear darker. Check this to brighten every image so they're easier to
      read on reMarkable. You should generally not use this on reMarkable Paper
      Pro.`}
    />
  );
}

export function SignOut({
  deviceToken,
  setOpts,
}: {
  deviceToken: string | undefined;
  setOpts: SetOptions;
}): ReactElement | null {
  const signout = useCallback(() => {
    setOpts({ deviceToken: "" });
  }, [setOpts]);

  if (deviceToken ?? true) {
    return (
      <Right>
        <Button
          variant="outlined"
          disabled={deviceToken === undefined}
          onClick={signout}
          fullWidth
        >
          Disconnect from your reMarkable account
        </Button>
      </Right>
    );
  } else {
    return null;
  }
}

function close(): void {
  window.close();
}

function Done(): ReactElement {
  return (
    <Right>
      <Button variant="contained" onClick={close} fullWidth>
        Done
      </Button>
    </Right>
  );
}

function SignInOptions({
  opts,
  setOpts,
  showSnack,
}: {
  opts: Partial<Options>;
  setOpts: SetOptions;
  showSnack: (snk: Snack) => void;
}): ReactElement {
  const {
    deviceToken,
    outputStyle,
    authHost = defaultOptions.authHost,
    tokenUrl = defaultOptions.tokenUrl,
  } = opts;
  const title = <Typography variant="h4">reMarkable ePub Options</Typography>;
  return (
    <Stack spacing={2}>
      <LeftRight label={title}>
        <img alt="repub" src={repubPlain} width={32} height={32} />
      </LeftRight>
      <OutputStylePicker outputStyle={outputStyle} setOpts={setOpts} />
      <SignIn
        deviceToken={deviceToken}
        outputStyle={outputStyle}
        setOpts={setOpts}
        showSnack={showSnack}
        authHost={authHost}
        tokenUrl={tokenUrl}
      />
    </Stack>
  );
}

function ResolutionSelector({
  resolution,
  setOpts,
  disabled,
}: {
  resolution: number | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={resolution ? resolution.toFixed() : undefined}
      onChange={(val) => {
        setOpts({ tableResolution: parseInt(val, 10) });
      }}
      selections={[
        { val: "1", icon: <FaRegSquare />, label: "1×" },
        { val: "3", icon: <FaTableCellsLarge />, label: "3×" },
        { val: "9", icon: <FaTableCells />, label: "9×" },
      ]}
      title="Table Resolution"
      caption="When converting tables to images, higher resolution tables will
      look better on devices, but will take longer to render, and will create
      large epub files. You must enable converting tables to images in order to
      alter this option."
      disabled={disabled}
    />
  );
}

function EpubOptions({
  opts,
  setOpts,
}: {
  opts: Partial<Options>;
  setOpts: SetOptions;
}): ReactElement {
  return (
    <Section
      title="ePub Options"
      subtitle="These options alter the way the epub is generated independent of
      whether it's uploaded to reMarkable or kept as an epub"
    >
      <ButtonSelection
        // potentially include captions next to each option
        value={opts.imageHandling}
        onChange={(val) => {
          setOpts({ imageHandling: val });
        }}
        selections={[
          {
            val: "keep",
            icon: <FaRegImages />,
            label: "Keep all",
          },
          {
            val: "filter",
            icon: <FaRegImage />,
            label: "First only",
          },
          {
            val: "strip",
            icon: <FaRegRectangleXmark />,
            label: "Remove all",
          },
        ]}
        title="Image Handling"
        caption="Control how images are handled: keep everything including
        duplicates, keep only the first image, or remove all images."
      />
      <CloseImages
        imageHrefSimilarityThreshold={opts.imageHrefSimilarityThreshold}
        setOpts={setOpts}
      />
      <ImageBrightness
        imageBrightness={opts.imageBrightness}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="imageShrink"
        title="Shrink images in epub"
        caption="Shrink images to the approximate resolution of the reMarkable.
        Enabling this will reduce the size of the generated epubs, but zooming
        in will not render with the same detail."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="hrefHeader"
        title="Include page URL in epub"
        caption="Include a small header with the original page URL right above
        the article title when converting an article into an epub."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="bylineHeader"
        title="Include byline in epub"
        caption="Include a small byline with the extracted author right below
        the article title when converting an article into an epub."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="authorByline"
        title="Use article author instead of byline"
        caption="Some articles list the publication as the byline. If this is
        true, also include the author if found."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="coverHeader"
        title="Include cover image in epub"
        caption="Include the extracted cover image right below the article title
        when converting an article into an epub."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="rmCss"
        title="Use reMarkable CSS"
        caption="The default remarkable css adds some extra margins around
        paragraphs among other changes. Select this to use it."
        opts={opts}
        setOpts={setOpts}
      />
      <ButtonSelection
        value={opts.shrinkGlyphs}
        onChange={(val) => {
          setOpts({ shrinkGlyphs: val });
        }}
        selections={[
          {
            val: "off",
            icon: <FaBan />,
            label: "Leave alone",
          },
          {
            val: "dynamic",
            icon: <FaA />,
            label: "Fit the font",
          },
          {
            val: "robust",
            icon: <FaLock />,
            label: "Fit any font",
          },
        ]}
        title="Shrink substituted characters"
        caption="reMarkable fonts fall back to Noto for certain characters, but
        those have different line heights, which renders the paragraph
        awkwardly. Shrinking them keeps the line height constant: fit the font
        shrinks as little as the selected font needs, fit any font shrinks
        enough to survive changing the font on the tablet."
      />
      <SimplCheckboxSelection
        name="codeCss"
        title="Use code environment CSS"
        caption="This renders <pre/> and <code/> tags in a wrapped fixed-width
        font with a light gray background."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="tabCss"
        title="Use table CSS"
        caption="This renders tables with some extra markup to make them more
        legible.  However, it's still experimental, so don't expect the
        rendering to be consistent"
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="filterLinks"
        title="Remove Links"
        caption="Links are rendered on reMarkable with an underline, but aren't
        navigable.  Setting this to true removes the links, decluttering the
        resulting epub."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="filterIframes"
        title="Remove IFrames"
        caption="Some pages may include relevant information in iframes.
        ReMarkable doesn't natively render these, but by disabling this, we'll
        copy the contents of preserved iframes into the epub contents."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="convertTables"
        title="Convert Tables to Images"
        caption="Some devices don't render tables well. Enabling this will
        convert the tables to images before rendering."
        opts={opts}
        setOpts={setOpts}
      />
      <SimplCheckboxSelection
        name="rotateTables"
        title="Rotate Tables"
        caption="If the rendered tables are wider than they are high, rotate
        them so they're rendered in portrait. You must enable converting tables
        to images in order to alter this option."
        opts={opts}
        setOpts={setOpts}
        disabled={opts.convertTables !== true}
      />
      <ResolutionSelector
        resolution={opts.tableResolution}
        setOpts={setOpts}
        disabled={opts.convertTables !== true}
      />
      <SimplCheckboxSelection
        name="promptTitle"
        title="Prompt for Title and Author"
        caption="If enabled, instead of automatically rendering the page, this
        extension will first prompt for the title and author you want to set."
        opts={opts}
        setOpts={setOpts}
        onChange={(val) => {
          chrome.action
            .setPopup({ popup: val ? "popup.html" : "" })
            .catch((err) => {
              console.error("couldn't set popup", err);
            });
        }}
      />
    </Section>
  );
}

function DownloadOptions({
  opts,
  setOpts,
}: {
  opts: Partial<Options>;
  setOpts: SetOptions;
}): ReactElement | null {
  return (
    <Section
      title="Download Options"
      subtitle="These are options that are only relevant if you're downloading
      articles as files."
    >
      <SimplCheckboxSelection
        name="downloadAsk"
        title="Ask for Filename"
        caption="When downloading as a file, ask where to save each file."
        opts={opts}
        setOpts={setOpts}
      />
    </Section>
  );
}

function CoverPageNumberSelector({
  coverPageNumber,
  setOpts,
  disabled,
}: {
  coverPageNumber: number | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <CheckboxSelection
      value={coverPageNumber === 0}
      onToggle={() => {
        setOpts({ coverPageNumber: coverPageNumber === 0 ? -1 : 0 });
      }}
      title="First Page Cover"
      caption="If checked, use the first page as cover / thumbnail on the
      reMarkable, otherwise use the last page visited"
      disabled={disabled}
    />
  );
}

const MarginsSmall = styled(FaAlignJustify)`
  transform: scaleX(1.25);
`;
const MarginsLarge = styled(FaAlignJustify)`
  transform: scaleX(0.75);
`;

function MarginSelector({
  margins,
  setOpts,
  disabled,
}: {
  margins: number | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={margins ? margins.toFixed() : undefined}
      onChange={(val) => {
        setOpts({ margins: parseInt(val, 10) });
      }}
      selections={[
        { val: "50", icon: <MarginsSmall />, label: "Small" },
        { val: "125", icon: <FaAlignJustify />, label: "Medium" },
        { val: "225", icon: <MarginsLarge />, label: "Large" },
      ]}
      title="Page Margins"
      caption="The margins around the edge of the document"
      disabled={disabled}
    />
  );
}

const FontSizeExtraSmall = styled(FaA)`
  transform: scale(0.7);
`;
const FontSizeSmall = styled(FaA)`
  transform: scale(0.8);
`;
const FontSizeLarge = styled(FaA)`
  transform: scale(1.2);
`;
const FontSizeExtraLarge = styled(FaA)`
  transform: scale(1.4);
`;
const FontSizeHuge = styled(FaA)`
  transform: scale(1.6);
`;

function TextScaleSelector({
  textScale,
  setOpts,
  disabled,
}: {
  textScale: number | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement | null {
  return (
    <ButtonSelection
      value={textScale === undefined ? undefined : textScale.toFixed(1)}
      onChange={(val) => {
        setOpts({ textScale: parseFloat(val) });
      }}
      selections={[
        {
          val: "0.7",
          icon: <FontSizeExtraSmall />,
          label: "70%",
        },
        {
          val: "0.8",
          icon: <FontSizeSmall />,
          label: "80%",
        },
        {
          val: "1.0",
          icon: <FaA />,
          label: "100%",
        },
        {
          val: "1.2",
          icon: <FontSizeLarge />,
          label: "120%",
        },
        {
          val: "1.5",
          icon: <FontSizeExtraLarge />,
          label: "150%",
        },
        {
          val: "2.0",
          icon: <FontSizeHuge />,
          label: "200%",
        },
      ]}
      title="Font Size"
      caption="The font size of the text in the document"
      disabled={disabled}
    />
  );
}

function LineHeightSelector({
  lineHeight,
  setOpts,
  disabled,
}: {
  lineHeight: number | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={lineHeight === undefined ? undefined : lineHeight.toFixed()}
      onChange={(val) => {
        setOpts({ lineHeight: parseInt(val, 10) });
      }}
      selections={[
        {
          val: "100",
          icon: <FaAlignJustify />,
          label: "100%",
        },
        {
          val: "120",
          icon: <FaBars />,
          label: "120%",
        },
        {
          val: "200",
          icon: <FaEquals />,
          label: "200%",
        },
      ]}
      title="Line Height"
      caption="The space between lines"
      disabled={disabled}
    />
  );
}

function TextAlignmentSelector({
  textAlignment,
  setOpts,
  disabled,
}: {
  textAlignment: "left" | "justify" | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={textAlignment}
      onChange={(val) => {
        setOpts({ textAlignment: val });
      }}
      selections={[
        {
          val: "left",
          icon: <FaAlignLeft />,
          label: "Left",
        },
        {
          val: "justify",
          icon: <FaAlignJustify />,
          label: "Justify",
        },
      ]}
      title="Text Alignment"
      caption="How text is set on each line"
      disabled={disabled}
    />
  );
}

function ViewBackgroundFilterSelector({
  viewBackgroundFilter,
  setOpts,
  disabled,
}: {
  viewBackgroundFilter: "off" | "fullpage" | null | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={viewBackgroundFilter === null ? "adaptive" : viewBackgroundFilter}
      onChange={(val) => {
        setOpts({ viewBackgroundFilter: val === "adaptive" ? null : val });
      }}
      selections={[
        {
          val: "fullpage",
          icon: <FaRegFileLines />,
          label: "Full page",
        },
        {
          val: "adaptive",
          icon: <FaRegFile />,
          label: "Adaptive",
        },
        {
          val: "off",
          icon: <FaRegFileImage />,
          label: "Off",
        },
      ]}
      title="Contrast Filter"
      caption="What contrast filter to apply to pages: Full page (optimized for
      text), adaptive (balanced), or off (optimized for images)"
      disabled={disabled}
    />
  );
}

function FontNameSelector({
  fontName,
  setOpts,
  disabled,
}: {
  fontName: string | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  return (
    <ButtonSelection
      value={fontName}
      onChange={(val) => {
        setOpts({ fontName: val });
      }}
      selections={[
        {
          val: "",
          label: "Ebook default",
          icon: (
            <Typography
              variant="caption"
              sx={{ textTransform: "none", fontStyle: "italic" }}
            >
              Default
            </Typography>
          ),
        },
        {
          val: "reMarkable Serif Small",
          label: "reMarkable Serif",
          icon: (
            <Typography
              variant="caption"
              sx={{ fontFamily: "'Noto Serif'", textTransform: "none" }}
            >
              reMarkable Serif
            </Typography>
          ),
        },
        {
          val: "reMarkable Sans",
          label: "reMarkable Sans",
          icon: (
            <Typography
              variant="caption"
              sx={{ fontFamily: "'Noto Sans'", textTransform: "none" }}
            >
              reMarkable Sans
            </Typography>
          ),
        },
        {
          val: "EB Garamond",
          label: "EB Garamond",
          icon: (
            <Typography
              variant="caption"
              sx={{ fontFamily: "'EB Garamond'", textTransform: "none" }}
            >
              EB Garamond
            </Typography>
          ),
        },
      ]}
      title="Font Name"
      caption="The font the tablet uses to render the text"
      disabled={disabled}
    />
  );
}

function TagsSelector({
  tags,
  setOpts,
  disabled,
}: {
  tags: string | undefined;
  setOpts: SetOptions;
  disabled?: boolean;
}): ReactElement {
  const control = (
    <TextField
      variant="standard"
      fullWidth
      value={tags ?? ""}
      onChange={(evt) => {
        setOpts({ tags: evt.target.value });
      }}
      disabled={disabled}
    />
  );
  const label = (
    <Box>
      <Typography>Tags</Typography>
      <Typography variant="caption">
        Comma separated list of tags to apply to uploaded documents
      </Typography>
    </Box>
  );
  return (
    <Right>
      <FormControlLabel
        control={control}
        label={label}
        labelPlacement="top"
        slotProps={{ typography: { sx: { width: "100%" } } }}
      />
    </Right>
  );
}

function DeviceIcon({
  width,
  height,
}: {
  width: number;
  height: number;
}): ReactElement {
  return (
    <Box
      sx={{
        width,
        height,
        border: "2px solid currentColor",
        borderRadius: "3px",
      }}
    />
  );
}

function PdfTrimSelector({
  pdfTrimDevice,
  setOpts,
}: {
  pdfTrimDevice: DeviceModel | null | undefined;
  setOpts: SetOptions;
}): ReactElement {
  return (
    <ButtonSelection
      value={pdfTrimDevice ?? "off"}
      onChange={(val) => {
        setOpts({ pdfTrimDevice: val === "off" ? null : val });
      }}
      selections={[
        { val: "off", icon: <FaBan />, label: "Off" },
        {
          val: "RM110",
          icon: <DeviceIcon width={15} height={20} />,
          label: "reMarkable",
        },
        {
          val: "RM02A",
          icon: <DeviceIcon width={18} height={24} />,
          label: "Paper Pro",
        },
        {
          val: "RM03A",
          icon: <DeviceIcon width={13} height={23} />,
          label: "Paper Pro Move",
        },
      ]}
      title="Trim PDF Margins"
      caption="Crop predominantly white margins from uploaded PDFs and zoom the
      content to fill the selected reMarkable's screen (reMarkable, Paper Pro, or
      Paper Pro Move). Best for academic papers like arXiv. Applies one
      document-wide fit and only affects uploaded PDFs."
    />
  );
}

function UploadOptions({
  opts,
  setOpts,
}: {
  opts: Partial<Options>;
  setOpts: SetOptions;
}): ReactElement | null {
  return (
    <Section
      title="Upload Options"
      subtitle="These are options that control how the ePub is rendered on the
      reMarkable when uploading. Only the font name also reaches the file
      itself, since shrinking substituted characters depends on it."
    >
      <MarginSelector margins={opts.margins} setOpts={setOpts} />
      <TextScaleSelector textScale={opts.textScale} setOpts={setOpts} />
      <LineHeightSelector lineHeight={opts.lineHeight} setOpts={setOpts} />
      <TextAlignmentSelector
        textAlignment={opts.textAlignment}
        setOpts={setOpts}
      />
      <ViewBackgroundFilterSelector
        viewBackgroundFilter={opts.viewBackgroundFilter}
        setOpts={setOpts}
      />
      <FontNameSelector fontName={opts.fontName} setOpts={setOpts} />
      <TagsSelector tags={opts.tags} setOpts={setOpts} />
      <CoverPageNumberSelector
        coverPageNumber={opts.coverPageNumber}
        setOpts={setOpts}
      />
      <PdfTrimSelector pdfTrimDevice={opts.pdfTrimDevice} setOpts={setOpts} />
    </Section>
  );
}

type ApiUrlKey = "authHost" | "uploadHost" | "rawHost" | "tokenUrl";

const apiUrlFields = new Map<ApiUrlKey, string>([
  ["authHost", "Auth Host"],
  ["uploadHost", "Upload Host"],
  ["rawHost", "Raw Host"],
  ["tokenUrl", "Token URL"],
]);

function UrlField({
  label,
  value,
  defaultValue,
  onChange,
  permitted,
}: {
  label: string;
  value: string | undefined;
  defaultValue: string;
  onChange: (val: string) => void;
  permitted: boolean | null;
}): ReactElement {
  const modified = value !== undefined && value !== defaultValue;
  const permIcon = !modified ? null : permitted === null ? (
    <FaQuestion />
  ) : permitted ? (
    <FaCheck />
  ) : (
    <FaTriangleExclamation />
  );
  const control = (
    <Input
      fullWidth
      value={value ?? ""}
      onChange={(evt) => {
        onChange(evt.target.value);
      }}
      endAdornment={
        modified ? (
          <InputAdornment position="end">
            {permIcon}
            <IconButton
              size="small"
              onClick={() => onChange(defaultValue)}
              edge="end"
            >
              <FaXmark />
            </IconButton>
          </InputAdornment>
        ) : undefined
      }
    />
  );
  const header = (
    <Box>
      <Typography>{label}</Typography>
    </Box>
  );
  return (
    <Right>
      <FormControlLabel
        control={control}
        label={header}
        labelPlacement="top"
        slotProps={{ typography: { sx: { width: "100%" } } }}
      />
    </Right>
  );
}

function ApiUrlsSection({
  opts,
  setOpts,
  showSnack,
}: {
  opts: Partial<Options>;
  setOpts: SetOptions;
  showSnack: (snk: Snack) => void;
}): ReactElement {
  const [permissions, setPermissions] = useState(new Map<ApiUrlKey, boolean>());

  // check permissions for each non-default URL individually
  useEffect(() => {
    if (!globalThis.chrome?.permissions) return;
    let stale = false;
    // deduplicate origins so we only call contains once per unique origin
    const originToKeys = new Map<string, ApiUrlKey[]>();
    for (const [key] of apiUrlFields) {
      const val = opts[key];
      if (val && val !== defaultOptions[key]) {
        try {
          const origin = `${new URL(val).origin}/`;
          const keys = originToKeys.get(origin);
          if (keys) {
            keys.push(key);
          } else {
            originToKeys.set(origin, [key]);
          }
        } catch {
          // ignore invalid URLs
        }
      }
    }
    for (const [origin, keys] of originToKeys) {
      chrome.permissions
        .contains({ origins: [origin] })
        .then((granted) => {
          if (stale) return;
          setPermissions((prev) => {
            const next = new Map(prev);
            for (const key of keys) {
              next.set(key, granted);
            }
            return next;
          });
        })
        .catch(console.error);
    }
    return () => {
      stale = true;
    };
  }, [opts]);

  const needsGrant = [...apiUrlFields.keys()].some((key) => {
    const val = opts[key];
    return val && val !== defaultOptions[key] && permissions.get(key) === false;
  });

  const grantPermissions = useCallback(() => {
    const origins = new Set<string>();
    for (const [key] of apiUrlFields) {
      const val = opts[key];
      if (val && val !== defaultOptions[key]) {
        try {
          origins.add(`${new URL(val).origin}/`);
        } catch {
          // ignore invalid URLs
        }
      }
    }
    if (origins.size === 0) return;
    chrome.permissions
      .request({ origins: [...origins] })
      .then((granted) => {
        if (granted) {
          setPermissions((prev) => {
            const next = new Map(prev);
            for (const [key] of apiUrlFields) {
              const val = opts[key];
              if (val && val !== defaultOptions[key]) {
                next.set(key, true);
              }
            }
            return next;
          });
          showSnack({
            key: "permissions granted",
            severity: "success",
            message: "host permissions granted",
          });
        }
      })
      .catch((err) => {
        console.error(err);
        showSnack({
          key: "permissions error",
          severity: "error",
          message: "could not grant host permissions",
        });
      });
  }, [opts, showSnack]);

  return (
    <Section
      title="Advanced"
      subtitle="Only change these if you know what you're doing. Custom API URLs are for self-hosted or alternate reMarkable backends."
    >
      {[...apiUrlFields.entries()].map(([key, label]) => (
        <UrlField
          key={key}
          label={label}
          value={opts[key]}
          defaultValue={defaultOptions[key]}
          onChange={(val) => {
            setOpts({ [key]: val });
          }}
          permitted={
            opts[key] && opts[key] !== defaultOptions[key]
              ? (permissions.get(key) ?? null)
              : null
          }
        />
      ))}
      {needsGrant && (
        <Right>
          <Button variant="contained" onClick={grantPermissions}>
            Grant Host Permissions
          </Button>
        </Right>
      )}
    </Section>
  );
}

interface Snack {
  key: string;
  severity: AlertColor;
  message: string;
}

export default function OptionsPage(): ReactElement {
  // snack bar
  const [open, setOpen] = useState(false);
  const [snack, setSnack] = useState<Snack>({
    key: "",
    severity: "info",
    message: "",
  });
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  const showSnack = useCallback((snk: Snack) => {
    setSnack(snk);
    setOpen(true);
  }, []);

  // options
  const [opts, setOptsState] = useState(unknownOpts);

  const setOpts = useCallback(
    (options: Partial<Options>) => {
      setOptsState((prev) => ({ ...prev, ...options }));
      setOptions(options).catch((err) => {
        console.error(err);
        showSnack({
          key: "set opts",
          severity: "error",
          message: "couldn't set options",
        });
      });
    },
    [showSnack],
  );

  useEffect(() => {
    if (opts === unknownOpts) {
      getOptions().then(setOpts, () => {
        showSnack({
          key: "reset options",
          severity: "warning",
          message: "problem reading options; resetting to default",
        });
        setOpts(defaultOptions);
      });
    }
  }, [opts, setOpts, showSnack]);

  const { deviceToken } = opts;

  // whole-page dropzone: uploads go to reMarkable, so it's live only once linked
  const [uploading, setUploading] = useState(false);
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (!file) {
        showSnack({
          key: "no files",
          severity: "error",
          message: "can only upload epub or pdf files",
        });
        return;
      }
      if (!deviceToken) return;
      setUploading(true);
      uploadFile(deviceToken, file)
        .then(() => {
          showSnack({
            key: "upload success",
            severity: "success",
            message: `uploaded ${file.name} successfully`,
          });
        })
        .catch((ex: unknown) => {
          console.error(ex);
          showSnack({
            key: "upload error",
            severity: "error",
            message: "problem uploading file",
          });
        })
        .finally(() => {
          setUploading(false);
        });
    },
    [showSnack, deviceToken],
  );
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open: openPicker,
  } = useDropzone({
    onDrop,
    accept: {
      "application/epub+zip": [".epub"],
      "application/pdf": [".pdf"],
      "text/markdown": [".md"],
      "multipart/related": [".mhtml"],
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: uploading || !deviceToken,
  });

  return (
    <ThemeProvider theme={theme}>
      <UploadControl.Provider value={{ open: openPicker, uploading }}>
        <div {...getRootProps()} style={{ minHeight: "100vh" }}>
          <input
            type="file"
            accept="application/epub+zip,application/pdf,text/markdown,multipart/related"
            style={{ display: "none" }}
            {...getInputProps()}
          />
          <Box
            sx={{
              maxWidth: "700px",
              width: "100%",
              padding: 0,
              margin: "0 auto",
            }}
          >
            <Stack sx={{ justifyContent: "space-between", minHeight: "100vh" }}>
              <Container maxWidth="sm" sx={{ padding: 4 }}>
                <Stack spacing={4}>
                  <SignInOptions
                    opts={opts}
                    setOpts={setOpts}
                    showSnack={showSnack}
                  />
                  <Box>
                    <EpubOptions opts={opts} setOpts={setOpts} />
                    <DownloadOptions opts={opts} setOpts={setOpts} />
                    <UploadOptions opts={opts} setOpts={setOpts} />
                    <ApiUrlsSection
                      opts={opts}
                      setOpts={setOpts}
                      showSnack={showSnack}
                    />
                  </Box>
                  <Done />
                </Stack>
              </Container>
              <Box>
                <Container maxWidth="sm" sx={{ padding: 4 }}>
                  <Stack>
                    <SignOut deviceToken={deviceToken} setOpts={setOpts} />
                  </Stack>
                </Container>
              </Box>
            </Stack>
          </Box>
        </div>
        {isDragActive && <DropOverlay reject={isDragReject} />}
        <Snackbar open={open} autoHideDuration={6000} onClose={close}>
          <Alert
            onClose={close}
            key={snack.key}
            severity={snack.severity}
            sx={{ width: "100%" }}
          >
            {snack.message}
          </Alert>
        </Snackbar>
      </UploadControl.Provider>
    </ThemeProvider>
  );
}
