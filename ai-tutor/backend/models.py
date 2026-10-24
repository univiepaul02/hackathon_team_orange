from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from database import Base


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    tutor_prompt = Column(Text, default="")
    socratic = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ica_collection_id = Column(String, nullable=True)  # ICA document collection ID


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    filename = Column(String, nullable=False)
    num_pages = Column(Integer, default=0)
    num_chunks = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    ica_file_id = Column(String, nullable=True)  # ICA file ID


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    session_id = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(Text, default="[]")   # JSON
    feedback = Column(Integer, nullable=True)  # 1 | -1 | None
    timestamp = Column(DateTime, default=datetime.utcnow)


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    label = Column(String, nullable=False)
    size = Column(Integer, default=0)
    example_questions = Column(Text, default="[]")  # JSON
    is_gap = Column(Boolean, default=False)
    computed_at = Column(DateTime, default=datetime.utcnow)
