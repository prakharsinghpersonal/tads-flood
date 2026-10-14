"""Shared v1 models. Numerical estimates and observed damage stay distinct."""
from datetime import date, datetime
import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = "1.0.0"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class AssessmentRequest(StrictModel):
    bbox: tuple[float, float, float, float]
    event_date: date
    mode: Literal["synthetic", "live"]

    @field_validator("bbox")
    @classmethod
    def valid_bbox(cls, value):
        west, south, east, north = value
        if not all(math.isfinite(x) for x in value):
            raise ValueError("Bounding box must contain finite coordinates")
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError("Expected positive WGS84 bbox [west, south, east, north]")
        if east - west > 0.5 or north - south > 0.5:
            raise ValueError("Prototype AOI limit: 0.5 degrees per axis")
        return value


class Source(StrictModel):
    source_id: str
    kind: Literal["sentinel_1", "sentinel_2", "osm", "dem", "synthetic"]
    acquired_at: datetime
    uri: str
    license: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    usage: Literal["input", "evaluation_only"] = "input"

    @field_validator("acquired_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timezone-aware timestamp required")
        return value


class Quality(StrictModel):
    status: Literal["usable", "partial", "unavailable"]
    valid_fraction: float = Field(ge=0, le=1)
    warnings: list[str]
    method_version: str


class Summary(StrictModel):
    candidate_flood_area_m2: float | None = Field(default=None, ge=0)
    exposed_asset_count: int | None = Field(default=None, ge=0)
    potentially_isolated_count: int = Field(ge=0)
    unknown_network_count: int = Field(ge=0)


class ReportClaim(StrictModel):
    claim_id: str
    text: str
    evidence_ids: list[str]


class Report(StrictModel):
    assessment_id: str
    mode: Literal["synthetic", "live", "cached_live"]
    generator: str
    ai_ready: bool
    language: Literal["en", "ne"]
    facts: dict[str, int | float | str | None]
    claims: list[ReportClaim]
    limitations: list[str]


class GroundedReport(Report):
    model: str | None
    refused: bool
    answer: str
    translation_reviewed: bool


class FeatureCollection(StrictModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict]


class Layers(StrictModel):
    flood: FeatureCollection
    debris: FeatureCollection
    roads: FeatureCollection
    buildings: FeatureCollection
    settlements: FeatureCollection


class Evidence(StrictModel):
    evidence_id: str
    source_ids: list[str]
    kind: Literal["inferred", "measured", "synthetic"]
    description: str
    method_version: str


class SettlementResult(StrictModel):
    settlement_id: str
    status: Literal["connected", "potentially_isolated", "preexisting_disconnected", "unknown_network"]
    baseline_facility_id: str | None
    baseline_route_edge_ids: list[str]
    post_event_facility_id: str | None
    post_event_route_edge_ids: list[str]
    candidate_cut_edge_ids: list[str]
    any_facility_access: bool | None
    evidence_ids: list[str]
    reason: str


class Assessment(StrictModel):
    schema_version: Literal["1.0.0"] = SCHEMA_VERSION
    assessment_id: str
    mode: Literal["synthetic", "live", "cached_live"]
    event_date: date
    bbox: tuple[float, float, float, float]
    generated_at: datetime
    sources: list[Source]
    quality: Quality
    summary: Summary
    layers: Layers
    settlements: list[SettlementResult]
    evidence: list[Evidence]
    limitations: list[str]

    @model_validator(mode="after")
    def integrity(self):
        AssessmentRequest.valid_bbox(self.bbox)
        Source.aware_time(self.generated_at)
        source_ids = [s.source_id for s in self.sources]
        evidence_ids = [e.evidence_id for e in self.evidence]
        settlement_ids = [s.settlement_id for s in self.settlements]
        if not source_ids or not evidence_ids:
            raise ValueError("Assessment needs source and evidence provenance")
        for ids in (source_ids, evidence_ids, settlement_ids):
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate identifiers in assessment")
        for source in self.sources:
            if source.usage != "input":
                raise ValueError("Evaluation-only sources cannot enter an assessment")
            if source.kind == "osm" and source.acquired_at.date() >= self.event_date:
                raise ValueError("OSM snapshot must precede the event date")
            if self.mode == "synthetic" and source.kind != "synthetic":
                raise ValueError("Synthetic fixtures must not claim real source provenance")
            if self.mode != "synthetic" and source.kind == "synthetic":
                raise ValueError("Live assessments cannot contain synthetic sources")
        for evidence in self.evidence:
            if not set(evidence.source_ids) <= set(source_ids):
                raise ValueError("Evidence cites missing source")
            if self.mode != "synthetic" and evidence.kind == "synthetic":
                raise ValueError("Live assessments cannot contain synthetic evidence")
        for settlement in self.settlements:
            if not set(settlement.evidence_ids) <= set(evidence_ids):
                raise ValueError("Settlement cites missing evidence")
        for collection in (self.layers.flood, self.layers.debris, self.layers.roads,
                           self.layers.buildings, self.layers.settlements):
            feature_ids = []
            for feature in collection.features:
                if feature.get("type") != "Feature" or not feature.get("geometry") or feature.get("id") is None:
                    raise ValueError("Assessment layers need identifiable GeoJSON features")
                properties = feature.get("properties", {})
                if not set(properties.get("evidence_ids", [])) <= set(evidence_ids):
                    raise ValueError("Layer feature cites missing evidence")
                if properties.get("source_id") not in source_ids:
                    raise ValueError("Layer feature cites missing source")
                feature_ids.append(str(feature["id"]))
            if len(feature_ids) != len(set(feature_ids)):
                raise ValueError("Layer feature identifiers must be unique")
        isolated = sum(s.status == "potentially_isolated" for s in self.settlements)
        unknown = sum(s.status == "unknown_network" for s in self.settlements)
        if isolated != self.summary.potentially_isolated_count or unknown != self.summary.unknown_network_count:
            raise ValueError("Summary disagrees with settlement results")
        return self


class Node(StrictModel):
    node_id: str


class RoadEdge(StrictModel):
    edge_id: str
    from_node: str
    to_node: str
    length_m: float = Field(gt=0)
    directed: bool = False
    candidate_blocked: bool = False
    evidence_ids: list[str] = Field(default_factory=list)


class GraphLocation(StrictModel):
    location_id: str
    node_id: str | None


class IsolationRequest(StrictModel):
    nodes: list[Node]
    edges: list[RoadEdge]
    settlements: list[GraphLocation]
    facilities: list[GraphLocation]

    @model_validator(mode="after")
    def valid_graph(self):
        node_ids = [n.node_id for n in self.nodes]
        for values in (node_ids, [e.edge_id for e in self.edges],
                       [s.location_id for s in self.settlements],
                       [f.location_id for f in self.facilities]):
            if len(values) != len(set(values)):
                raise ValueError("Graph identifiers must be unique")
        known = set(node_ids)
        for edge in self.edges:
            if edge.from_node not in known or edge.to_node not in known:
                raise ValueError("Dangling road endpoint")
        for location in self.settlements + self.facilities:
            if location.node_id is not None and location.node_id not in known:
                raise ValueError("Unknown graph location node")
        return self
