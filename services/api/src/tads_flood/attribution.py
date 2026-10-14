"""Required external-data credits; code license does not override data licenses."""
SENTINEL = "Contains modified Copernicus Sentinel data 2026."
WORLDDEM = ("Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence "
            "and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.")
OSM = "© OpenStreetMap contributors."


def attributions(assessment):
    if assessment.mode == "synthetic":
        return ["Synthetic training data; no real-world flood finding."]
    kinds = {source.kind for source in assessment.sources}
    return ([SENTINEL] if kinds & {"sentinel_1", "sentinel_2"} else []) + \
           ([WORLDDEM] if "dem" in kinds else []) + ([OSM] if "osm" in kinds else [])
